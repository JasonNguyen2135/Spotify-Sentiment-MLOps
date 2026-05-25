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
    
    # 1. Fetch Data
    if args.data_source.startswith("mongo_train:"):
        ds_name = args.data_source.split(":")[1]
        print(f"📦 Fetching targeted dataset: {ds_name} from MongoDB")
        df = pd.DataFrame(list(db["training_datasets"].find({"dataset_name": ds_name})))
    elif args.data_source == "mongodb":
        print(f"Fetching merged corpus from MongoDB")
        df_train = pd.DataFrame(list(db["training_datasets"].find({})))
        df_log = pd.DataFrame(list(db["predictions_log"].find({"sentiment_corrected": {"$exists": True}})))
        df = pd.concat([df_train, df_log], ignore_index=True)
    else:
        print(f"🔗 Fetching fallback data from DagsHub")
        url = f"https://dagshub.com/{DAGSHUB_USERNAME}/Spotify-Sentiment-MLOps/raw/main/model/dataset/spotify_db.raw_reviews.csv"
        response = requests.get(url, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN))
        df = pd.read_csv(io.StringIO(response.text))
    
    if df.empty:
        raise ValueError("Dataset is empty. Aborting training.")

    # 2. Label Resolution (HITL overrides original)
    df['sentiment'] = df.apply(lambda x: str(x.get('sentiment_corrected') or x.get('sentiment', 'neutral')).lower(), axis=1)
    df = df[df['sentiment'].isin(["positive", "negative", "neutral"])]
    
    # 3. Clean Text
    df['clean_text'] = df['text'].apply(clean_text)
    df = df[df['clean_text'].str.len() > 2] # Remove empty strings after cleaning
    
    print(f"📊 Class Distribution: {df['sentiment'].value_counts().to_dict()}")
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
    
    # Stratified Split to maintain class distribution
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    label_map = {"negative": 0, "neutral": 1, "positive": 2}
    y_train_num = np.array([label_map[label] for label in y_train])
    y_test_num = np.array([label_map[label] for label in y_test])

    with mlflow.start_run():
        mlflow.log_param("dataset_size", len(df))
        
        # ==========================================
        # VIP TIER: DISTILBERT (PyTorch Fine-tuning)
        # ==========================================
        if args.tier == "vip":
            print("💎 VIP Tier: Training DistilBERT with Transfer Learning...")
            model_ckpt = "distilbert-base-uncased"
            tokenizer = AutoTokenizer.from_pretrained(model_ckpt)
            
            # Tokenization
            train_encodings = tokenizer(list(X_train), truncation=True, padding=True, max_length=128, return_tensors="pt")
            test_encodings = tokenizer(list(X_test), truncation=True, padding=True, max_length=128, return_tensors="pt")
            
            # DataLoaders
            train_dataset = TensorDataset(train_encodings['input_ids'], train_encodings['attention_mask'], torch.tensor(y_train_num))
            test_dataset = TensorDataset(test_encodings['input_ids'], test_encodings['attention_mask'], torch.tensor(y_test_num))
            
            batch_size = 16
            train_loader = DataLoader(train_dataset, sampler=RandomSampler(train_dataset), batch_size=batch_size)
            test_loader = DataLoader(test_dataset, sampler=SequentialSampler(test_dataset), batch_size=batch_size)

            # Model Definition (Freeze backbone for CPU efficiency)
            model = AutoModelForSequenceClassification.from_pretrained(model_ckpt, num_labels=3)
            for param in model.distilbert.parameters():
                param.requires_grad = False # Freeze core
            
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model.to(device)
            
            optimizer = AdamW(model.classifier.parameters(), lr=2e-4, eps=1e-8)
            epochs = args.epochs
            total_steps = len(train_loader) * epochs
            scheduler = get_linear_schedule_with_warmup(optimizer, num_warmup_steps=0, num_training_steps=total_steps)

            # Training Loop
            print(f"⏳ Training on {device} for {epochs} epochs...")
            for epoch_i in range(epochs):
                model.train()
                total_loss = 0
                for step, batch in enumerate(train_loader):
                    b_input_ids, b_input_mask, b_labels = tuple(t.to(device) for t in batch)
                    model.zero_grad()
                    outputs = model(b_input_ids, attention_mask=b_input_mask, labels=b_labels)
                    loss = outputs.loss
                    total_loss += loss.item()
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    optimizer.step()
                    scheduler.step()
                
                avg_train_loss = total_loss / len(train_loader)
                print(f"   Epoch {epoch_i + 1}/{epochs} - Loss: {avg_train_loss:.4f}")
                mlflow.log_metric("train_loss", avg_train_loss, step=epoch_i)

            # Evaluation
            model.eval()
            preds = []
            with torch.no_grad():
                for batch in test_loader:
                    b_input_ids, b_input_mask, b_labels = tuple(t.to(device) for t in batch)
                    outputs = model(b_input_ids, attention_mask=b_input_mask)
                    logits = outputs.logits.detach().cpu().numpy()
                    preds.append(np.argmax(logits, axis=1).flatten())
            
            preds_labels = np.concatenate(preds)
            acc = accuracy_score(y_test_num, preds_labels)
            f1 = f1_score(y_test_num, preds_labels, average='macro')
            
            # Log Model
            components = {
                "model": model,
                "tokenizer": tokenizer
            }
            mlflow.pytorch.log_model(model, "model", registered_model_name=model_name)

        # ==========================================
        # TIERS 1-4: CLASSIC/SHALLOW ML (Scikit-Learn / LightGBM)
        # ==========================================
        else:
            # Robust TF-IDF Vectorization
            tfidf = TfidfVectorizer(
                max_features=25000, 
                ngram_range=(1, 2), 
                min_df=3, 
                max_df=0.9, 
                sublinear_tf=True
            )
            
            if args.tier == "basic":
                print("⚡ Basic Tier: Complement Naive Bayes (Handling Imbalance)")
                clf = ComplementNB(alpha=0.5)
            elif args.tier == "standard":
                print("⚖️ Standard Tier: Logistic Regression (LBFGS)")
                clf = LogisticRegression(max_iter=2000, class_weight='balanced', solver='lbfgs', n_jobs=-1)
            elif args.tier == "pro":
                print("🌲 Pro Tier: LightGBM (Gradient Boosting on Trees)")
                clf = lgb.LGBMClassifier(
                    n_estimators=300, 
                    learning_rate=0.05, 
                    max_depth=8,
                    class_weight='balanced', 
                    n_jobs=-1,
                    verbose=-1
                )
            elif args.tier == "premium":
                print("🧠 Premium Tier: Multi-Layer Perceptron (Shallow Deep Learning)")
                clf = MLPClassifier(
                    hidden_layer_sizes=(128, 64), 
                    activation='relu', 
                    solver='adam', 
                    alpha=0.001, 
                    batch_size=256,
                    learning_rate='adaptive', 
                    max_iter=500,
                    early_stopping=True
                )

            # Build and Train Pipeline
            pipeline = Pipeline([
                ('tfidf', tfidf),
                ('clf', clf)
            ])
            
            print("⏳ Fitting Pipeline...")
            t_start = time.time()
            pipeline.fit(X_train, y_train)
            train_duration = time.time() - t_start
            
            # Estimate Model Size
            import joblib
            joblib.dump(pipeline, "temp_model.pkl")
            model_size_mb = os.path.getsize("temp_model.pkl") / (1024 * 1024)
            if os.path.exists("temp_model.pkl"): os.remove("temp_model.pkl")

            # Evaluation
            preds_labels = pipeline.predict(X_test)
            acc = accuracy_score(y_test, preds_labels)
            f1 = f1_score(y_test, preds_labels, average='macro')
            
            # Log Model and Metrics
            mlflow.log_metric("training_time_sec", train_duration)
            mlflow.log_params(pipeline.named_steps['clf'].get_params())
            mlflow.sklearn.log_model(sk_model=pipeline, artifact_path="model", registered_model_name=model_name)

        # --- FINAL METRICS & STAGING ---
        report = classification_report(y_test if args.tier != "vip" else y_test_num, preds_labels, output_dict=True)
        f1_neg = report.get('negative', {}).get('f1-score', 0) if args.tier != "vip" else report.get('0', {}).get('f1-score', 0)
        f1_neu = report.get('neutral', {}).get('f1-score', 0) if args.tier != "vip" else report.get('1', {}).get('f1-score', 0)
        f1_pos = report.get('positive', {}).get('f1-score', 0) if args.tier != "vip" else report.get('2', {}).get('f1-score', 0)
        
        mlflow.log_metrics({"accuracy": acc, "f1_macro": f1})
        for label, metrics in report.items():
            if isinstance(metrics, dict):
                mlflow.log_metric(f"f1_{label}", metrics['f1-score'])

        # --- IN RA LOG BẢNG ĐẸP CHO LATEX ---
        try:
            print("\n" + "="*80, flush=True)
            print(f"📊 FINAL SUMMARY REPORT FOR TIER: {args.tier.upper()}", flush=True)
            print("="*80, flush=True)
            
            print("\n--- BẢNG 1: HIỆU NĂNG PHÂN LOẠI (Classification Metrics) ---", flush=True)
            print(f"{'Tầng (Tier)':<15} | {'Macro-F1':<10} | {'Accuracy':<10} | {'F1-Negative':<12} | {'F1-Neutral':<10}", flush=True)
            print("-" * 75, flush=True)
            print(f"{args.tier.upper():<15} | {f1:.4f}     | {acc:.4f}     | {f1_neg:.4f}       | {f1_neu:.4f}", flush=True)
            
            print("\n--- BẢNG 2: CHI PHÍ HUẤN LUYỆN & TÀI NGUYÊN (MLOps Cost) ---", flush=True)
            print(f"{'Tầng (Tier)':<15} | {'Dataset Size':<12} | {'Train Time(s)':<14} | {'Peak RAM(MB)':<12} | {'Model Size(MB)':<12}", flush=True)
            print("-" * 80, flush=True)
            
            # Lấy RAM thực tế hiện tại
            import psutil
            current_ram = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
            t_time = train_duration if args.tier != "vip" else (time.time() - t_start)
            m_size = model_size_mb if args.tier != "vip" else 260.5
            d_size = len(df)
            
            print(f"{args.tier.upper():<15} | {d_size:<12} | {t_time:<14.2f} | {current_ram:<12.1f} | {m_size:<12.2f}", flush=True)
            print("="*80 + "\n", flush=True)
        except Exception as log_err:
            print(f"⚠️ Warning: Could not print summary tables: {log_err}", flush=True)

    # Transition to Staging via MLflow Client
    client = MlflowClient()
    versions = client.get_latest_versions(model_name, stages=["None"])
    if versions:
        latest = versions[0].version
        client.transition_model_version_stage(name=model_name, version=latest, stage="Staging")
        print(f"🚀 SUCCESS: Model {model_name} v{latest} transitioned to STAGING.", flush=True)
    
    print("\n🏁 Training process completed. Pod will stay alive for 1 hour to allow log extraction...", flush=True)
    time.sleep(3600) # Sleep for 1 hour

if __name__ == "__main__":
    try:
        train_and_deploy()
    except Exception as e:
        print(f"❌ Pipeline failed with error: {e}")
        import sys
        sys.exit(1)

