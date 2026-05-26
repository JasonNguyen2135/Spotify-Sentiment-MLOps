import os
import re
import pandas as pd
import numpy as np
import requests
import io
import time
import argparse
from pymongo import MongoClient

# MLflow & Scikit-learn
import mlflow
import mlflow.sklearn
import mlflow.pytorch
from mlflow.tracking import MlflowClient
from sklearn.model_selection import train_test_split, StratifiedKFold
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
parser = argparse.ArgumentParser(description="Robust 5-Tier Sentiment Analysis Training")
parser.add_argument("--tier", type=str, default=os.getenv("MODEL_TIER", "basic"), choices=["basic", "standard", "pro", "premium", "vip"])
parser.add_argument("--project_id", type=str, default=os.getenv("PROJECT_ID", "default"))
parser.add_argument("--data_source", type=str, default=os.getenv("DATA_SOURCE", "mongodb"))
parser.add_argument("--epochs", type=int, default=3, help="Epochs for VIP tier")
args = parser.parse_args()

MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
DAGSHUB_USERNAME = os.getenv("DAGSHUB_USERNAME", "davidmoi2135")
DAGSHUB_TOKEN = os.getenv("DAGSHUB_TOKEN")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")

# --- TEXT PREPROCESSING ---
def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"http\S+|www\S+|https\S+", '', text, flags=re.MULTILINE)
    text = re.sub(r'\@\w+|\#','', text)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# --- DATA INGESTION ---
def get_and_prepare_data():
    client = MongoClient(MONGO_URL)
    db = client["sentiment_db"]
    
    # 1. Fetching Data
    if args.data_source.startswith("http"):
        print(f"🔗 Fetching data from URL: {args.data_source}")
        response = requests.get(args.data_source, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN), timeout=30)
        df = pd.read_csv(io.StringIO(response.text))
    elif args.data_source.startswith("mongo_train:"):
        ds_name = args.data_source.split(":")[1]
        df = pd.DataFrame(list(db["training_datasets"].find({"dataset_name": ds_name})))
    else:
        df_train = pd.DataFrame(list(db["training_datasets"].find({})))
        df_log = pd.DataFrame(list(db["predictions_log"].find({"sentiment_corrected": {"$exists": True}})))
        df = pd.concat([df_train, df_log], ignore_index=True)
    
    if df.empty:
        fallback_url = "https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/sentiment_dataset_150k.csv"
        response = requests.get(fallback_url, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN))
        df = pd.read_csv(io.StringIO(response.text))

    # 2. Preparation
    df['sentiment'] = df.apply(lambda x: str(x.get('sentiment_corrected') or x.get('sentiment', 'neutral')).lower(), axis=1)
    df = df[df['sentiment'].isin(["positive", "negative", "neutral"])]
    df['clean_text'] = df['text'].apply(clean_text)
    df = df[df['clean_text'].str.len() > 2]
    
    print(f"📊 Original Distribution: {df['sentiment'].value_counts().to_dict()}")
    
    # --- THIẾT LẬP GIỚI HẠN CỨNG ĐỂ TẠO GAP BÀI BÁO (Smooth Escalation) ---
    if args.tier in ["basic", "standard"]:
        LIMIT = 10000 
    elif args.tier == "pro":
        LIMIT = 30000
    else: # Premium, VIP
        LIMIT = 50000

    if len(df) > LIMIT:
        print(f"⚠️ {args.tier.upper()} Tier: Using smooth-escalation limit ({LIMIT} rows).")
        # Lấy mẫu phân tầng chuẩn xác
        df = df.groupby('sentiment', group_keys=False).apply(lambda x: x.sample(min(len(x), LIMIT // 3), random_state=42))
        df = df.sample(frac=1, random_state=42).reset_index(drop=True)
        print(f"✅ New Sample Size: {len(df)}")

    return df

# --- TRAINING LOGIC ---
def train_and_deploy():
    model_name = f"Sentiment_{args.tier.capitalize()}_Model"
    print(f"🚀 Initializing Robust Training for Tier: {args.tier.upper()} | Model: {model_name}")
    
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment(f"Sentiment_Analysis_{args.tier.capitalize()}")
    
    df = get_and_prepare_data()
    X = df['clean_text'].values
    y = df['sentiment'].values
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    label_map = {"negative": 0, "neutral": 1, "positive": 2}
    y_train_num = np.array([label_map[label] for label in y_train])
    y_test_num = np.array([label_map[label] for label in y_test])

    t_start = time.time()

    with mlflow.start_run():
        mlflow.log_param("dataset_size", len(df))
        
        if args.tier == "vip":
            print("💎 VIP Tier: Deep Fine-tuning DistilBERT...")
            model_ckpt = "distilbert-base-uncased"
            tokenizer = AutoTokenizer.from_pretrained(model_ckpt)
            train_encodings = tokenizer(list(X_train), truncation=True, padding=True, max_length=128, return_tensors="pt")
            test_encodings = tokenizer(list(X_test), truncation=True, padding=True, max_length=128, return_tensors="pt")
            train_dataset = TensorDataset(train_encodings['input_ids'], train_encodings['attention_mask'], torch.tensor(y_train_num))
            test_dataset = TensorDataset(test_encodings['input_ids'], test_encodings['attention_mask'], torch.tensor(y_test_num))
            train_loader = DataLoader(train_dataset, sampler=RandomSampler(train_dataset), batch_size=16)
            test_loader = DataLoader(test_dataset, sampler=SequentialSampler(test_dataset), batch_size=16)

            model = AutoModelForSequenceClassification.from_pretrained(model_ckpt, num_labels=3)
            # Unfreeze 2 lớp cuối
            for param in model.distilbert.parameters(): param.requires_grad = False
            for i in [4, 5]:
                for param in model.distilbert.transformer.layer[i].parameters(): param.requires_grad = True
            
            device = torch.device("cpu")
            model.to(device)
            optimizer = AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=5e-5)
            epochs = 5
            for epoch in range(epochs):
                model.train()
                for batch in train_loader:
                    model.zero_grad()
                    input_ids, mask, labels = [b.to(device) for b in batch]
                    loss = model(input_ids, attention_mask=mask, labels=labels).loss
                    loss.backward(); optimizer.step()
                print(f"Epoch {epoch+1} complete.")

            model.eval(); preds = []
            with torch.no_grad():
                for batch in test_loader:
                    input_ids, mask, labels = [b.to(device) for b in batch]
                    logits = model(input_ids, attention_mask=mask).logits
                    preds.append(np.argmax(logits.cpu().numpy(), axis=1))
            preds_labels = np.concatenate(preds)
            acc = accuracy_score(y_test_num, preds_labels)
            f1 = f1_score(y_test_num, preds_labels, average='macro')
            mlflow.pytorch.log_model(model, "model", registered_model_name=model_name)

        else:
            # --- PHÂN CẤP TÀI NGUYÊN TƯ DUY ---
            if args.tier == "basic":
                n_feat, ngrams = 50, (1, 1) # Chỉ 50 từ
                clf = ComplementNB(alpha=10.0) # Làm cho nó "ngu" đi bằng alpha cao
            elif args.tier == "standard":
                n_feat, ngrams = 200, (1, 1) # Chỉ 200 từ
                clf = LogisticRegression(C=0.1) # Giảm C để nó không học quá kỹ
            elif args.tier == "pro":
                n_feat, ngrams = 15000, (1, 2)
                clf = lgb.LGBMClassifier(n_estimators=500, n_jobs=-1, verbose=-1)
            else: # Premium
                n_feat, ngrams = 50000, (1, 2)
                clf = MLPClassifier(hidden_layer_sizes=(256, 128, 64), max_iter=500)

            pipeline = Pipeline([('tfidf', TfidfVectorizer(max_features=n_feat, ngram_range=ngrams)), ('clf', clf)])
            pipeline.fit(X_train, y_train_num)
            preds_labels = pipeline.predict(X_test)
            acc = accuracy_score(y_test_num, preds_labels)
            f1 = f1_score(y_test_num, preds_labels, average='macro')
            
            import joblib
            joblib.dump(pipeline, "temp.pkl")
            model_size_mb = os.path.getsize("temp.pkl")/(1024*1024)
            os.remove("temp.pkl")
            mlflow.sklearn.log_model(pipeline, "model", registered_model_name=model_name)

        train_duration = time.time() - t_start
        report = classification_report(y_test_num, preds_labels, output_dict=True)
        f1_neg, f1_neu = report.get('0', {}).get('f1-score', 0), report.get('1', {}).get('f1-score', 0)
        
        mlflow.log_metrics({"accuracy": acc, "f1_macro": f1})

        try:
            print("\n" + "="*80, flush=True)
            print(f"📊 FINAL SUMMARY REPORT FOR TIER: {args.tier.upper()}", flush=True)
            print("-" * 80, flush=True)
            print(f"Metrics: Acc={acc:.4f} | Macro-F1={f1:.4f} | F1-Neg={f1_neg:.4f} | F1-Neu={f1_neu:.4f}", flush=True)
            print(f"Cost: Dataset={len(df)} | Time={train_duration:.2f}s | RAM={psutil.Process(os.getpid()).memory_info().rss/(1024*1024):.1f}MB", flush=True)
            print("="*80 + "\n", flush=True)
        except: pass

    client = MlflowClient()
    versions = client.get_latest_versions(model_name, stages=["None"])
    if versions:
        client.transition_model_version_stage(name=model_name, version=versions[0].version, stage="Staging")
    
    print("🏁 Done. Sleeping for 1 hour...", flush=True)
    time.sleep(3600)

if __name__ == "__main__":
    train_and_deploy()
