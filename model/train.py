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
from dotenv import load_dotenv

# 1. Nạp biến môi trường
load_dotenv()
DAGSHUB_USERNAME = os.getenv("DAGSHUB_USERNAME")
DAGSHUB_TOKEN = os.getenv("DAGSHUB_TOKEN")

# TÊN REPO TRÊN DAGSHUB CỦA BẠN (Sửa lại nếu khác)
REPO_NAME = "Spotify-Sentiment-MLOps" 

def train_and_deploy():
    # 2. Cấu hình xác thực DagsHub
    os.environ['MLFLOW_TRACKING_USERNAME'] = DAGSHUB_USERNAME
    os.environ['MLFLOW_TRACKING_PASSWORD'] = DAGSHUB_TOKEN

    # 3. Trỏ ống kính về thẳng MLflow của DagsHub
    dagshub_uri = f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}.mlflow"
    mlflow.set_tracking_uri(dagshub_uri)
    mlflow.set_experiment("Spotify_Sentiment_Analysis")

    # 4. Đọc dữ liệu Local
    print("Đang nạp dữ liệu spotify_labeled.csv...")
    df = pd.read_csv("spotify_labeled.csv")
    X = df['content'].fillna('')
    y = df['sentiment']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    with mlflow.start_run() as run:
        print("Đang huấn luyện mô hình...")
        
        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(max_features=5000)),
            ('clf', LogisticRegression(max_iter=1000))
        ])

        pipeline.fit(X_train, y_train)
        predictions = pipeline.predict(X_test)
        acc = accuracy_score(y_test, predictions)
        
        print(f"Độ chính xác (Accuracy): {acc:.4f}")

        # 5. Lưu Metadata (DagsHub tự cất vào Database của họ)
        mlflow.log_param("model_type", "Logistic Regression")
        mlflow.log_param("tfidf_max_features", 5000)
        mlflow.log_metric("accuracy", acc)

        # 6. Lưu Model (DagsHub tự vác lên S3 của họ)
        model_name = "Spotify_Production_Model"
        print("Đang đẩy file mô hình lên DagsHub...")
        mlflow.sklearn.log_model(
            sk_model=pipeline,
            artifact_path="model_files",
            registered_model_name=model_name
        )
        
        run_id = run.info.run_id

    # 7. Tự động gắn thẻ "Production"
    print("Đang gán nhãn Production...")
    client = MlflowClient()
    latest_version = client.get_latest_versions(model_name, stages=["None"])[0].version
    
    client.transition_model_version_stage(
        name=model_name,
        version=latest_version,
        stage="Production",
        archive_existing_versions=True
    )
    
    print(f"\n✅ THÀNH CÔNG RỰC RỠ!")
    print(f"- Mở trình duyệt vào trang DagsHub của bạn, chọn tab MLflow để xem kết quả.")
    print(f"- Phiên bản mô hình: v{latest_version} đã sẵn sàng ở chế độ [Production]")

if __name__ == "__main__":
    train_and_deploy()
