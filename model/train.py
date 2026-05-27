import os
import re
import pandas as pd
import numpy as np
import requests
import io
import time
import argparse
import psutil
from pymongo import MongoClient

# MLflow & Scikit-learn
import mlflow
import mlflow.sklearn
import mlflow.pytorch
from mlflow.tracking import MlflowClient
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import ComplementNB
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, f1_score, classification_report
import lightgbm as lgb

# PyTorch & HuggingFace
import torch
from torch.utils.data import DataLoader, TensorDataset, RandomSampler, SequentialSampler
from torch.optim import AdamW
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup

# --- CONFIGURATION ---
parser = argparse.ArgumentParser(description="Professional 5-Tier Sentiment Training")
parser.add_argument("--tier", type=str, default=os.getenv("MODEL_TIER", "basic"), choices=["basic", "standard", "pro", "premium", "vip"])
parser.add_argument("--project_id", type=str, default=os.getenv("PROJECT_ID", "default"))
parser.add_argument("--data_source", type=str, default=os.getenv("DATA_SOURCE", "mongodb"))
parser.add_argument("--epochs", type=int, default=3, help="Epochs for VIP tier")
args = parser.parse_args()

MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
DAGSHUB_USERNAME = "davidmoi2135"
DAGSHUB_TOKEN = os.getenv("DAGSHUB_TOKEN")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")

def clean_text(text):
    if not isinstance(text, str): return ""
    text = text.lower()
    text = re.sub(r"http\S+|www\S+|https\S+", '', text, flags=re.MULTILINE)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    return re.sub(r'\s+', ' ', text).strip()

def get_and_prepare_data():
    client = MongoClient(MONGO_URL)
    db = client["sentiment_db"]
    
    # 1. Load Data
    if args.data_source.startswith("http"):
        response = requests.get(args.data_source, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN), timeout=30)
        df = pd.read_csv(io.StringIO(response.text))
    else:
        df_train = pd.DataFrame(list(db["training_datasets"].find({})))
        df_log = pd.DataFrame(list(db["predictions_log"].find({"sentiment_corrected": {"$exists": True}})))
        df = pd.concat([df_train, df_log], ignore_index=True)
    
    if df.empty:
        fallback_url = "https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/sentiment_dataset_150k.csv"
        df = pd.read_csv(io.StringIO(requests.get(fallback_url).text))

    # 2. Process
    df['sentiment'] = df.apply(lambda x: str(x.get('sentiment_corrected') or x.get('sentiment', 'neutral')).lower(), axis=1)
    df = df[df['sentiment'].isin(["positive", "negative", "neutral"])]
    df['clean_text'] = df['text'].apply(clean_text)
    
    # --- PHÂN CẤP DỮ LIỆU ĐỂ ĐẠT MỤC TIÊU ACCURACY (80-83-87-90-90+) ---
    if args.tier == "basic": LIMIT = 5000
    elif args.tier == "standard": LIMIT = 10000 
    elif args.tier == "pro": LIMIT = 15000 
    elif args.tier == "premium": LIMIT = 40000 
    else: LIMIT = 30000 # Giảm xuống 30k cho an toàn


    if len(df) > LIMIT:
        print(f"⚠️ {args.tier.upper()} Tier: Sampling {LIMIT} rows for hierarchy control.")
        df = df.groupby('sentiment', group_keys=False).apply(lambda x: x.sample(min(len(x), LIMIT // 3), random_state=42))
        df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    
    return df

def train_and_deploy():
    model_name = f"Sentiment_{args.tier.capitalize()}_Model"
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment(f"Sentiment_Analysis_{args.tier.capitalize()}")
    
    df = get_and_prepare_data()
    X_train, X_test, y_train, y_test = train_test_split(df['clean_text'].values, df['sentiment'].values, test_size=0.2, random_state=42, stratify=df['sentiment'])
    
    label_map = {"negative": 0, "neutral": 1, "positive": 2}
    y_train_num = np.array([label_map[label] for label in y_train])
    y_test_num = np.array([label_map[label] for label in y_test])

    t_start = time.time()
    with mlflow.start_run():
        if args.tier == "vip":
            # VIP: Transformer with unfreezing
            model_ckpt = "distilbert-base-uncased"
            tokenizer = AutoTokenizer.from_pretrained(model_ckpt)
            train_enc = tokenizer(list(X_train), truncation=True, padding=True, max_length=128, return_tensors="pt")
            test_enc = tokenizer(list(X_test), truncation=True, padding=True, max_length=128, return_tensors="pt")
            train_dataset = TensorDataset(train_enc['input_ids'], train_enc['attention_mask'], torch.tensor(y_train_num))
            test_dataset = TensorDataset(test_enc['input_ids'], test_enc['attention_mask'], torch.tensor(y_test_num))
            train_loader = DataLoader(train_dataset, sampler=RandomSampler(train_dataset), batch_size=16)
            
            model = AutoModelForSequenceClassification.from_pretrained(model_ckpt, num_labels=3)
            for param in model.distilbert.parameters(): param.requires_grad = False
            for i in [4, 5]: 
                for param in model.distilbert.transformer.layer[i].parameters(): param.requires_grad = True
            
            model.to("cpu")
            optimizer = AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=5e-5)
            for epoch in range(5):
                model.train()
                for b in train_loader:
                    optimizer.zero_grad()
                    loss = model(b[0], attention_mask=b[1], labels=b[2]).loss
                    loss.backward(); optimizer.step()
                print(f"Epoch {epoch+1} complete.")
            
            model.eval(); 
            with torch.no_grad():
                logits = model(test_enc['input_ids'], attention_mask=test_enc['attention_mask']).logits
                preds_labels = np.argmax(logits.numpy(), axis=1)
            mlflow.pytorch.log_model(model, "model", registered_model_name=model_name)

        else:
            # --- THIẾT LẬP VỐN TỪ THEO MỤC TIÊU ---
            if args.tier == "basic": n_feat, ngrams = 1500, (1, 1) # Giữ 1.5k từ
            elif args.tier == "standard": n_feat, ngrams = 3800, (1, 1) # Lên 3.8k từ, unigrams
            elif args.tier == "pro": n_feat, ngrams = 8000, (1, 2) # Giữ 8k từ, bigrams
            elif args.tier == "premium": n_feat, ngrams = 20000, (1, 2)
            else: n_feat, ngrams = 50000, (1, 2)
            
            tfidf = TfidfVectorizer(max_features=n_feat, ngram_range=ngrams, sublinear_tf=True)
            
            if args.tier == "basic": clf = ComplementNB(alpha=10.0)
            elif args.tier == "standard": clf = LogisticRegression(C=0.1, max_iter=1000)
            elif args.tier == "pro": clf = lgb.LGBMClassifier(n_estimators=230, class_weight='balanced', verbose=-1) # Xuống 230 cây
            else: clf = MLPClassifier(hidden_layer_sizes=(128, 64), max_iter=500)

            pipeline = Pipeline([('tfidf', tfidf), ('clf', clf)])
            pipeline.fit(X_train, y_train_num)
            preds_labels = pipeline.predict(X_test)
            mlflow.sklearn.log_model(pipeline, "model", registered_model_name=model_name)

        # Metrics Calculation
        acc = accuracy_score(y_test_num, preds_labels)
        f1_macro = f1_score(y_test_num, preds_labels, average='macro')
        report = classification_report(y_test_num, preds_labels, output_dict=True)
        
        f1_neg = report.get('0', {}).get('f1-score', 0)
        f1_neu = report.get('1', {}).get('f1-score', 0)
        f1_pos = report.get('2', {}).get('f1-score', 0)
        
        # --- FINAL SUMMARY LOG ---
        print("\n" + "="*90, flush=True)
        print(f"📊 FINAL SUMMARY REPORT FOR TIER: {args.tier.upper()}", flush=True)
        print("-" * 90, flush=True)
        print(f"OVERALL   | Accuracy: {acc:.4f} | Macro-F1: {f1_macro:.4f} | Train Time: {time.time()-t_start:.2f}s", flush=True)
        print("-" * 90, flush=True)
        print(f"PER-CLASS | F1-Negative: {f1_neg:.4f} | F1-Neutral: {f1_neu:.4f} | F1-Positive: {f1_pos:.4f}", flush=True)
        print("-" * 90, flush=True)
        print(f"RESOURCES | Rows: {len(df):<10} | Features: {n_feat if args.tier != 'vip' else 'BERT':<10} | RAM: {psutil.Process(os.getpid()).memory_info().rss/(1024*1024):.1f}MB", flush=True)
        print("="*90 + "\n", flush=True)

        mlflow.log_metrics({"accuracy": acc, "f1_macro": f1_macro, "f1_neg": f1_neg, "f1_neu": f1_neu, "f1_pos": f1_pos})

    client = MlflowClient()
    versions = client.get_latest_versions(model_name, stages=["None"])
    if versions: client.transition_model_version_stage(name=model_name, version=versions[0].version, stage="Staging")
    print("🏁 Completed. Sleeping for 1 hour...", flush=True)
    time.sleep(3600)

if __name__ == "__main__":
    train_and_deploy()
