import os
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow.tracking import MlflowClient
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, f1_score
import requests
import io
import time
import argparse
from pymongo import MongoClient

# Parse Arguments
parser = argparse.ArgumentParser()
parser.add_argument("--tier", type=str, default=os.getenv("MODEL_TIER", "basic"), choices=["basic", "standard", "pro", "premium", "vip"])
parser.add_argument("--project_id", type=str, default=os.getenv("PROJECT_ID", "default"))
parser.add_argument("--data_source", type=str, default=os.getenv("DATA_SOURCE", "mongodb"))
args = parser.parse_args()

# System Configuration
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
DAGSHUB_USERNAME = os.getenv("DAGSHUB_USERNAME", "davidmoi2135")
DAGSHUB_TOKEN = os.getenv("DAGSHUB_TOKEN")
REPO_NAME = "Spotify-Sentiment-MLOps"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")

def get_data():
    client = MongoClient(MONGO_URL)
    db = client["sentiment_db"]
    
    if args.data_source.startswith("mongo_train:"):
        # Targeted training from a specific dataset (e.g. the 10k crawl)
        ds_name = args.data_source.split(":")[1]
        print(f"📦 Fetching targeted dataset: {ds_name} from training_datasets")
        df = pd.DataFrame(list(db["training_datasets"].find({"dataset_name": ds_name})))
    elif args.data_source == "mongodb":
        print(f"Fetching all available logs for project: {args.project_id}")
        # Priority 1: Dedicated training collection
        df_train = pd.DataFrame(list(db["training_datasets"].find({})))
        # Priority 2: Standard logs
        df_log = pd.DataFrame(list(db["predictions_log"].find({})))
        # Priority 3: Legacy raw reviews
        df_raw = pd.DataFrame(list(db["raw_reviews"].find({})))
        
        df = pd.concat([df_train, df_log, df_raw], ignore_index=True)
    else:
        # URL or direct CSV path
        print(f"🔗 Fetching data from source: {args.data_source}")
        response = requests.get(args.data_source, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN))
        df = pd.read_csv(io.StringIO(response.text))
    
    if df.empty or 'sentiment' not in df.columns and 'sentiment_corrected' not in df.columns:
        print("⚠️ Warning: Source data empty or invalid. Using baseline CSV.")
        url = f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}/raw/main/model/dataset/spotify_db.raw_reviews.csv"
        response = requests.get(url, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN))
        df = pd.read_csv(io.StringIO(response.text))
        # Ensure baseline CSV has 3 classes if missing
        if 'sentiment' in df.columns and df['sentiment'].nunique() < 3:
            print("💡 Note: Baseline CSV is binary. Future crawls will expand this.")
    
    # Standardize sentiment column
    if not df.empty:
        # Use corrected sentiment if available, otherwise original, default to neutral
        df['sentiment'] = df.apply(lambda x: str(x.get('sentiment_corrected') or x.get('sentiment', 'neutral')).lower(), axis=1)
    
    # Filter for standard classes
    valid_classes = ["positive", "negative", "neutral"]
    df = df[df['sentiment'].isin(valid_classes)]
    
    print(f"📊 Final Dataset Distribution: {df['sentiment'].value_counts().to_dict()}")
    return df[['text', 'sentiment']].dropna()

def train_and_deploy():
    model_name = f"Sentiment_{args.tier.capitalize()}_Model"
    print(f"🚀 Training Tier: {args.tier.upper()} | Model Name: {model_name}")
    
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment(f"Sentiment_Analysis_{args.tier.capitalize()}")
    
    df = get_data()
    print(f"Loaded {len(df)} records. Sentiment counts: {df['sentiment'].value_counts().to_dict()}")

    X_train, X_test, y_train, y_test = train_test_split(df['text'].fillna(''), df['sentiment'], test_size=0.2, random_state=42)

    # Architecture selection
    if args.tier == "basic":
        clf = LogisticRegression(max_iter=1000)
    elif args.tier == "standard":
        clf = RandomForestClassifier(n_estimators=100, max_depth=10)
    elif args.tier == "pro":
        clf = RandomForestClassifier(n_estimators=200)
    elif args.tier == "premium":
        clf = GradientBoostingClassifier(n_estimators=100)
    else: # VIP
        clf = GradientBoostingClassifier(n_estimators=200, learning_rate=0.05)

    with mlflow.start_run():
        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(max_features=5000)),
            ('clf', clf)
        ])

        pipeline.fit(X_train, y_train)
        preds = pipeline.predict(X_test)
        acc = accuracy_score(y_test, preds)
        f1 = f1_score(y_test, preds, average='weighted')
        
        print(f"Metrics: Acc={acc:.4f}, F1={f1:.4f}")
        mlflow.log_params({"tier": args.tier, "algo": type(clf).__name__})
        mlflow.log_metrics({"accuracy": acc, "f1": f1})

        mlflow.sklearn.log_model(sk_model=pipeline, artifact_path="model", registered_model_name=model_name)

    # Transition to Staging
    client = MlflowClient()
    versions = client.get_latest_versions(model_name, stages=["None"])
    if versions:
        latest = versions[0].version
        client.transition_model_version_stage(name=model_name, version=latest, stage="Staging")
        print(f"✅ Success: {model_name} v{latest} moved to Staging.")
    
    time.sleep(10)

if __name__ == "__main__":
    try:
        train_and_deploy()
    except Exception as e:
        print(f"Process failed with error: {e}")
        import sys
        sys.exit(1)
