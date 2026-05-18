import os
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow.tracking import MlflowClient
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score
import requests
import io
import time
from pymongo import MongoClient

# System Configuration
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
DAGSHUB_USERNAME = os.getenv("DAGSHUB_USERNAME", "davidmoi2135")
DAGSHUB_TOKEN = os.getenv("DAGSHUB_TOKEN")
REPO_NAME = "Spotify-Sentiment-MLOps"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
PROJECT_ID = os.getenv("PROJECT_ID", "default")

def train_and_deploy():
    print(f"Initializing model training process for Project: {PROJECT_ID}")
    
    # Setup MLflow Tracking
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment("Sentiment_Analysis_Platform")
    
    # Handle data acquisition
    data_source = os.getenv("DATA_SOURCE", "mongodb")
    
    if data_source == "mongodb":
        print(f"Fetching data from MongoDB for project: {PROJECT_ID}")
        client = MongoClient(MONGO_URL)
        db = client["sentiment_db"]
        collection = db["raw_reviews"]
        
        # Lấy dữ liệu của project (fallback lấy hết nếu là default)
        query = {}
        if PROJECT_ID != "default" and str(PROJECT_ID).isdigit():
            query = {"project_id": int(PROJECT_ID)}
        elif PROJECT_ID != "default":
            query = {"project_id": PROJECT_ID}
            
        cursor = collection.find(query)
        df = pd.DataFrame(list(cursor))
        
        if df.empty:
            print("⚠️ Warning: MongoDB dataset is empty for this project. Falling back to default baseline.")
            data_source = f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}/raw/main/model/dataset/spotify_db.raw_reviews.csv"
        else:
            print(f"Loaded {len(df)} records from MongoDB")
            # Chuyển đổi _id của mongo sang string để tránh lỗi
            if '_id' in df.columns:
                df['_id'] = df['_id'].astype(str)

    if data_source.startswith("https"):
        print(f"Fetching data from remote source: {data_source}")
        response = requests.get(data_source, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN))
        response.raise_for_status() 
        df = pd.read_csv(io.StringIO(response.text))
    elif os.path.exists(data_source):
        print(f"Loading data from local path: {data_source}")
        df = pd.read_csv(data_source)
        
    if df.empty:
        raise Exception("No data available for training.")

    print(f"Successfully loaded {len(df)} records for training")

    X = df['text'].fillna('')
    y = df['sentiment']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    with mlflow.start_run():
        print("Executing training pipeline")
        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(max_features=5000)),
            ('clf', LogisticRegression(max_iter=1000))
        ])

        pipeline.fit(X_train, y_train)
        predictions = pipeline.predict(X_test)
        acc = accuracy_score(y_test, predictions)
        print(f"Final model accuracy: {acc:.4f}")

        mlflow.log_param("model_type", "Logistic Regression")
        mlflow.log_param("dataset_size", len(df))
        mlflow.log_metric("accuracy", acc)

        # Dynamic model name based on project
        project_id = os.getenv("PROJECT_ID", "default")
        if project_id in ["admin_hub", "default", "Sentiment_Analysis_Platform"]:
            model_name = "Spotify_Production_Model"
        else:
            model_name = f"Sentiment_Analysis_Model_{project_id}"
        
        print(f"Registering model as: {model_name}")

        mlflow.sklearn.log_model(
            sk_model=pipeline,
            artifact_path="model_files",
            registered_model_name=model_name
        )

    # Update model registry
    client = MlflowClient()
    
    # 1. Get current Production model accuracy
    current_prod_acc = 0.0
    try:
        prod_versions = client.get_latest_versions(model_name, stages=["Production"])
        if prod_versions:
            run_id = prod_versions[0].run_id
            run = client.get_run(run_id)
            current_prod_acc = run.data.metrics.get("accuracy", 0.0)
            print(f"Current Production accuracy: {current_prod_acc:.4f}")
    except Exception as e:
        print(f"Could not retrieve current Production accuracy: {e}")

    # 2. Transition new version to Staging for manual review
    versions = client.get_latest_versions(model_name, stages=["None"])
    if versions:
        latest_version = versions[0].version
        client.transition_model_version_stage(
            name=model_name, version=latest_version, stage="Staging", archive_existing_versions=False
        )
        print(f"✅ Success: Version {latest_version} (Acc: {acc:.4f}) registered and moved to Staging for manual review.")
        
    print("Training job completed. Maintaining session for log collection.")
    time.sleep(60)

if __name__ == "__main__":
    try:
        train_and_deploy()
    except Exception as e:
        print(f"Process failed with error: {e}")
        import sys
        sys.exit(1) # Exit with error code so Airflow knows it failed
