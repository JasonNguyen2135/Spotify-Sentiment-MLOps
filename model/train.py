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

# 1. Nạp biến môi trường
DAGSHUB_USERNAME = os.getenv("DAGSHUB_USERNAME")
DAGSHUB_TOKEN = os.getenv("DAGSHUB_TOKEN")
REPO_NAME = "Spotify-Sentiment-MLOps" 

def train_and_deploy():
    os.environ['MLFLOW_TRACKING_USERNAME'] = DAGSHUB_USERNAME
    os.environ['MLFLOW_TRACKING_PASSWORD'] = DAGSHUB_TOKEN

    dagshub_uri = f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}.mlflow"
    mlflow.set_tracking_uri(dagshub_uri)
    mlflow.set_experiment("Spotify_Sentiment_Analysis")

    # 4. Đọc dữ liệu (Ưu tiên đọc file cục bộ mà InitContainer đã kéo về)
    local_data_path = "dataset/spotify_db.raw_reviews.csv"
    data_url = f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}/raw/main/model/dataset/spotify_db.raw_reviews.csv"
    
    if os.path.exists(local_data_path):
        print(f"📁 Đang nạp dữ liệu từ bộ nhớ cục bộ Pod: {local_data_path}")
        df = pd.read_csv(local_data_path)
    else:
        print(f"📡 Không thấy file cục bộ, đang tải từ DagsHub URL: {data_url}")
        df = pd.read_csv(data_url, storage_options={'Authorization': f'token {DAGSHUB_TOKEN}'})
    
    X = df['text'].fillna('')
    y = df['sentiment']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    with mlflow.start_run() as run:
        print("🚀 Đang huấn luyện mô hình...")
        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(max_features=5000)),
            ('clf', LogisticRegression(max_iter=1000))
        ])

        pipeline.fit(X_train, y_train)
        predictions = pipeline.predict(X_test)
        acc = accuracy_score(y_test, predictions)
        print(f"✅ Accuracy: {acc:.4f}")

        mlflow.log_param("model_type", "Logistic Regression")
        mlflow.log_metric("accuracy", acc)

        model_name = "Spotify_Production_Model"
        mlflow.sklearn.log_model(
            sk_model=pipeline,
            artifact_path="model_files",
            registered_model_name=model_name
        )
        
    # 7. Gán nhãn Production
    client = MlflowClient()
    versions = client.get_latest_versions(model_name, stages=["None"])
    if versions:
        latest_version = versions[0].version
        client.transition_model_version_stage(
            name=model_name, version=latest_version, stage="Production", archive_existing_versions=True
        )
        print(f"✨ Model v{latest_version} is now in [Production]")

if __name__ == "__main__":
    train_and_deploy()
