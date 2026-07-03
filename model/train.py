import os
import re
import pandas as pd
import numpy as np
import requests
import io
import time
import argparse
import psutil
import gc
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
# Paper-experiment overrides (all optional):
#   SAMPLE_LIMIT - force the same training-sample budget for every tier
#   TEST_SOURCE  - path/URL of the frozen shared test set; when set, the model
#                  trains on ALL prepared rows and is evaluated on this set
#                  instead of an internal 80/20 split
#   KEEP_ALIVE   - "1" keeps the pod alive 1h after finishing (debug only)
SAMPLE_LIMIT = os.getenv("SAMPLE_LIMIT")
TEST_SOURCE = os.getenv("TEST_SOURCE")
KEEP_ALIVE = os.getenv("KEEP_ALIVE", "0") == "1"


def load_csv(source):
    """Load a CSV from a local path or an HTTP(S) URL."""
    if os.path.exists(source):
        return pd.read_csv(source)
    response = requests.get(source, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN), timeout=60)
    return pd.read_csv(io.StringIO(response.text))


def peak_ram_mb():
    """Peak memory of the container (cgroup v2), falling back to process peak RSS."""
    try:
        with open("/sys/fs/cgroup/memory.peak") as f:
            return int(f.read().strip()) / (1024 * 1024)
    except Exception:
        pass
    try:
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
    except Exception:
        return psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)

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
    if os.path.exists(args.data_source) or args.data_source.startswith("http"):
        df = load_csv(args.data_source)
    else:
        df_train = pd.DataFrame(list(db["training_datasets"].find({})))
        df_log = pd.DataFrame(list(db["predictions_log"].find({"sentiment_corrected": {"$exists": True}})))
        df = pd.concat([df_train, df_log], ignore_index=True)
    
    if df.empty:
        fallback_url = "https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/sentiment_dataset_150k.csv"
        df = pd.read_csv(io.StringIO(requests.get(fallback_url).text))

    # 2. Process
    # Prefer the HITL-corrected label when present; treat NaN/None as missing
    # (NaN is truthy in Python, so a plain `or` would wrongly pick NaN for
    # uncorrected training rows once the predictions_log column is merged).
    def _pick_sentiment(x):
        corrected = x.get('sentiment_corrected')
        if pd.isna(corrected):
            corrected = None
        return str(corrected or x.get('sentiment', 'neutral')).lower()
    df['sentiment'] = df.apply(_pick_sentiment, axis=1)
    df = df[df['sentiment'].isin(["positive", "negative", "neutral"])]
    df['clean_text'] = df['text'].apply(clean_text)
    
    # --- PHÂN CẤP DỮ LIỆU (ROWS) THEO YÊU CẦU ---
    if args.tier == "basic": LIMIT = 5000
    elif args.tier == "standard": LIMIT = 15000
    elif args.tier == "pro": LIMIT = 15000
    elif args.tier == "premium": LIMIT = 25000 # Hạ xuống 25k cho ổn định RAM
    else: LIMIT = 5000 # VIP lùi về 5k cho nhanh và an toàn

    if SAMPLE_LIMIT:  # equal-sample-size mode for the paper experiments
        LIMIT = int(SAMPLE_LIMIT)
        print(f"⚖️ SAMPLE_LIMIT override: every tier trains on {LIMIT} rows", flush=True)

    if len(df) > LIMIT:
        print(f"⚠️ {args.tier.upper()} Tier: Sampling {LIMIT} rows...", flush=True)
        df = df.groupby('sentiment', group_keys=False).apply(lambda x: x.sample(min(len(x), LIMIT // 3), random_state=42))
    
    # Shuffle ALWAYS
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    print(f"✅ Data preparation complete. Final Size: {len(df)}", flush=True)
    
    return df

def train_and_deploy():
    model_name = f"Sentiment_{args.tier.capitalize()}_Model"
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment(f"Sentiment_Analysis_{args.tier.capitalize()}")
    
    df = get_and_prepare_data()
    if TEST_SOURCE:
        # Frozen shared test set: train on ALL prepared rows, evaluate on the
        # fixed set every tier shares (paper Table 2 methodology).
        df_test = load_csv(TEST_SOURCE)
        df_test = df_test[df_test['sentiment'].isin(["positive", "negative", "neutral"])].copy()
        df_test['clean_text'] = df_test['text'].apply(clean_text)
        n_before = len(df)
        df = df[~df['clean_text'].isin(set(df_test['clean_text']))]
        if n_before - len(df):
            print(f"🛡️ Removed {n_before - len(df)} training rows overlapping the test set", flush=True)
        X_train, y_train = df['clean_text'].values, df['sentiment'].values
        X_test, y_test = df_test['clean_text'].values, df_test['sentiment'].values
        print(f"🧪 Frozen test set: train={len(X_train)} | test={len(X_test)}", flush=True)
    else:
        X_train, X_test, y_train, y_test = train_test_split(df['clean_text'].values, df['sentiment'].values, test_size=0.2, random_state=42, stratify=df['sentiment'])

    label_map = {"negative": 0, "neutral": 1, "positive": 2}
    y_train_num = np.array([label_map[label] for label in y_train])
    y_test_num = np.array([label_map[label] for label in y_test])

    t_start = time.time()
    with mlflow.start_run():
        if args.tier == "vip":
            print("💎 VIP Tier: Deep Fine-tuning with Memory Optimization...", flush=True)
            model_ckpt = "distilbert-base-uncased"
            tokenizer = AutoTokenizer.from_pretrained(model_ckpt)
            train_enc = tokenizer(list(X_train), truncation=True, padding=True, max_length=128, return_tensors="pt")
            test_enc = tokenizer(list(X_test), truncation=True, padding=True, max_length=128, return_tensors="pt")
            train_dataset = TensorDataset(train_enc['input_ids'], train_enc['attention_mask'], torch.tensor(y_train_num))
            test_dataset = TensorDataset(test_enc['input_ids'], test_enc['attention_mask'], torch.tensor(y_test_num))
            train_loader = DataLoader(train_dataset, sampler=RandomSampler(train_dataset), batch_size=16)
            test_loader = DataLoader(test_dataset, sampler=SequentialSampler(test_dataset), batch_size=16)

            model = AutoModelForSequenceClassification.from_pretrained(model_ckpt, num_labels=3)
            for param in model.distilbert.parameters(): param.requires_grad = False
            for i in [4, 5]: 
                for param in model.distilbert.transformer.layer[i].parameters(): param.requires_grad = True
            
            model.to("cpu")
            optimizer = AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=5e-5)
            epochs = 3 # Giảm xuống 3 epoch cho an toàn RAM/Thời gian
            total_steps = len(train_loader) * epochs
            
            print(f"🎬 Starting Training Loop ({total_steps} total steps)...", flush=True)
            t_fit = time.time()
            global_step = 0
            for epoch in range(epochs):
                model.train()
                for b in train_loader:
                    global_step += 1
                    optimizer.zero_grad()
                    loss = model(b[0], attention_mask=b[1], labels=b[2]).loss
                    loss.backward(); optimizer.step()
                    if global_step % 10 == 0:
                        print(f"   🔹 Epoch {epoch+1}/{epochs} | Step {global_step}/{total_steps} | Loss: {loss.item():.4f}", flush=True)
                
                # Giải phóng RAM sau mỗi epoch
                gc.collect()
            
            fit_seconds = time.time() - t_fit
            print("🧪 Training complete. Starting evaluation on test split...", flush=True)
            model.eval(); preds = []
            with torch.no_grad():
                for b in test_loader:
                    logits = model(b[0], attention_mask=b[1]).logits
                    preds.append(np.argmax(logits.numpy(), axis=1))
            preds_labels = np.concatenate(preds)
            acc = accuracy_score(y_test_num, preds_labels)
            f1 = f1_score(y_test_num, preds_labels, average='macro')
            mlflow.pytorch.log_model(model, "model", registered_model_name=model_name)

        else:
            # --- TÀI NGUYÊN CLASSIC ---
            if args.tier == "basic": n_feat, ngrams = 1500, (1, 1)
            elif args.tier == "standard": n_feat, ngrams = 3900, (1, 2)
            elif args.tier == "pro": n_feat, ngrams = 4000, (1, 2)
            else: n_feat, ngrams = 20000, (1, 2)

            tfidf = TfidfVectorizer(max_features=n_feat, ngram_range=ngrams, sublinear_tf=True)
            if args.tier == "basic": clf = ComplementNB(alpha=10.0)
            elif args.tier == "standard": clf = LogisticRegression(C=0.1, max_iter=1000)
            elif args.tier == "pro": clf = lgb.LGBMClassifier(n_estimators=170, class_weight='balanced', verbose=-1)
            else: clf = MLPClassifier(hidden_layer_sizes=(128, 64), max_iter=500)

            pipeline = Pipeline([('tfidf', tfidf), ('clf', clf)])
            t_fit = time.time()
            pipeline.fit(X_train, y_train_num)
            fit_seconds = time.time() - t_fit
            preds_labels = pipeline.predict(X_test)
            mlflow.sklearn.log_model(pipeline, "model", registered_model_name=model_name)

        # Metrics Final
        acc = accuracy_score(y_test_num, preds_labels)
        f1_macro = f1_score(y_test_num, preds_labels, average='macro')
        report = classification_report(y_test_num, preds_labels, output_dict=True)
        f1_neg, f1_neu, f1_pos = report.get('0', {}).get('f1-score', 0), report.get('1', {}).get('f1-score', 0), report.get('2', {}).get('f1-score', 0)
        
        # --- FINAL SUMMARY REPORT ---
        total_seconds = time.time() - t_start
        speed = len(X_train) / fit_seconds if fit_seconds > 0 else 0
        ram_peak = peak_ram_mb()
        ram_now = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
        print("\n" + "="*90, flush=True)
        print(f"📊 FINAL SUMMARY REPORT FOR TIER: {args.tier.upper()}", flush=True)
        print("-" * 90, flush=True)
        print(f"OVERALL   | Accuracy: {acc:.4f} | Macro-F1: {f1_macro:.4f}", flush=True)
        print("-" * 90, flush=True)
        print(f"PER-CLASS | F1-Negative: {f1_neg:.4f} | F1-Neutral: {f1_neu:.4f} | F1-Positive: {f1_pos:.4f}", flush=True)
        print("-" * 90, flush=True)
        print(f"TIMING    | Fit: {fit_seconds:.2f}s | Total (incl. setup+eval): {total_seconds:.2f}s | Speed: {speed:.1f} samples/s", flush=True)
        print("-" * 90, flush=True)
        print(f"RESOURCES | Train rows: {len(X_train):<8} | Features: {n_feat if args.tier != 'vip' else 'BERT':<10} | RAM peak: {ram_peak:.1f}MB (now {ram_now:.1f}MB)", flush=True)
        print("="*90 + "\n", flush=True)
        mlflow.log_metrics({"accuracy": acc, "f1_macro": f1_macro, "f1_neg": f1_neg, "f1_neu": f1_neu, "f1_pos": f1_pos,
                            "fit_seconds": round(fit_seconds, 2), "total_seconds": round(total_seconds, 2),
                            "samples_per_second": round(speed, 1), "peak_ram_mb": round(ram_peak, 1),
                            "n_train": len(X_train), "n_test": len(X_test)})
        mlflow.log_params({"tier": args.tier, "sample_limit": SAMPLE_LIMIT or "per-tier default",
                           "test_source": TEST_SOURCE or "internal 80/20 split"})

    client = MlflowClient()
    versions = client.get_latest_versions(model_name, stages=["None"])
    if versions: client.transition_model_version_stage(name=model_name, version=versions[0].version, stage="Staging")
    if KEEP_ALIVE:
        print("🏁 Completed. KEEP_ALIVE=1 -> pod sleeps for 1 hour...", flush=True)
        time.sleep(3600)
    else:
        print("🏁 Completed. Exiting.", flush=True)

if __name__ == "__main__":
    train_and_deploy()
