import os
from fastapi import FastAPI
import mlflow.sklearn
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Spotify Sentiment API")

# Cấu hình DagsHub
DAGSHUB_USERNAME = os.getenv("DAGSHUB_USERNAME")
DAGSHUB_TOKEN = os.getenv("DAGSHUB_TOKEN")
REPO_NAME = "Spotify-Sentiment-MLOps"

os.environ['MLFLOW_TRACKING_USERNAME'] = DAGSHUB_USERNAME
os.environ['MLFLOW_TRACKING_PASSWORD'] = DAGSHUB_TOKEN
mlflow.set_tracking_uri(f"https://dagshub.com/{DAGSHUB_USERNAME}/{REPO_NAME}.mlflow")

# Tải model từ Registry (Dùng bản Production)
model_name = "Spotify_Production_Model"
model_uri = f"models:/{model_name}/Production"

print(f"⏳ Đang tải model {model_name} từ DagsHub...")
model = mlflow.sklearn.load_model(model_uri)
print("✅ Model đã sẵn sàng!")

@app.get("/")
def home():
    return {"message": "API Sentiment Spotify đang chạy!", "model_version": "Production"}

@app.post("/predict")
def predict(review: str):
    # Dự đoán cảm xúc
    prediction = model.predict([review])[0]
    sentiment = "Tích cực" if prediction == 1 else "Tiêu cực"
    return {
        "review": review,
        "sentiment": sentiment,
        "status": "Success"
    }
