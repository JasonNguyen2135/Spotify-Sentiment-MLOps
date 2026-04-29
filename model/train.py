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

# 1. Nạp biến môi trường từ K8s
DAGSHUB_USERNAME = os.getenv("DAGSHUB_USERNAME")
DAGSHUB_TOKEN = os.getenv("DAGSHUB_TOKEN")
REPO_NAME = "Spotify-Sentiment-MLOps" 

def train_and_deploy():
    # 2. Cấu hình xác thực DagsHub
    os.environ['MLFLOW_TRACKING_USERNAME'] = DAGSHUB_USERNAME
    os.environ['MLFLOW_TRACKING_PASSWORD'] = DAGSHUB_TOKEN

    # 3. Trỏ ống kính về thẳng MLflow của DagsHub
    dagshub_uri = f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}.mlflow"
    mlflow.set_tracking_uri(dagshub_uri)
    mlflow.set_experiment("Spotify_Sentiment_Analysis")

    # 4. Đọc dữ liệu trực tiếp từ DagsHub (Raw CSV)
    # URL có định dạng: https://dagshub.com/<user>/<repo>/raw/<branch>/<path>
    data_url = f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}/raw/main/model/dataset/spotify_db.raw_reviews.csv"
    
    print(f"📡 Đang tải dữ liệu từ DagsHub: {data_url}")
    # Dùng auth token để tải nếu repo private
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
        print(f"✅ Độ chính xác (Accuracy): {acc:.4f}")

        mlflow.log_param("model_type", "Logistic Regression")
        mlflow.log_metric("accuracy", acc)

        # 6. Lưu Model
        model_name = "Spotify_Production_Model"
        mlflow.sklearn.log_model(
            sk_model=pipeline,
            artifact_path="model_files",
            registered_model_name=model_name
        )
        
    # 7. Tự động gắn thẻ "Production"
    client = MlflowClient()
    latest_version = client.get_latest_versions(model_name, stages=["None"])[0].version
    client.transition_model_version_stage(
        name=model_name, version=latest_version, stage="Production", archive_existing_versions=True
    )
    print(f"✨ Model v{latest_version} is now in [Production]")

if __name__ == "__main__":
    train_and_deploy()
