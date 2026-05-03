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
import requests  # Thêm dòng này
import io        # Thêm dòng này

# 1. Nạp biến môi trường
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://47.129.38.134:5000")

def train_and_deploy():
    # Cấu hình MLflow tự dựng trên AWS
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment("Spotify_Sentiment_AWS")

    # 4. KÉO DỮ LIỆU ĐỘNG (Ưu tiên biến môi trường DATA_SOURCE)
    data_source = os.getenv("DATA_SOURCE", f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}/raw/main/model/dataset/spotify_db.raw_reviews.csv")
    
    if data_source.startswith("http"):
        print(f"📡 Đang tải dữ liệu từ URL: {data_source}")
        response = requests.get(data_source, auth=(DAGSHUB_USERNAME, DAGSHUB_TOKEN))
        response.raise_for_status() 
        df = pd.read_csv(io.StringIO(response.text))
    else:
        print(f"📁 Đang đọc dữ liệu từ file local: {data_source}")
        df = pd.read_csv(data_source)
        
    print(f"✅ Đã nạp thành công {len(df)} dòng dữ liệu!")

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
