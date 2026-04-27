from fastapi import FastAPI
import mlflow.sklearn
import os
import requests

app = FastAPI(title="Model Prediction Service")

# ====== LOAD ENV ======
username = os.getenv("DAGSHUB_USERNAME")
password = os.getenv("DAGSHUB_PASSWORD")  

if not username or not password:
    raise Exception("❌ Missing DAGSHUB credentials")

os.environ['MLFLOW_TRACKING_USERNAME'] = username
os.environ['MLFLOW_TRACKING_PASSWORD'] = password

# ====== MLFLOW ======
mlflow.set_tracking_uri(
    f"https://dagshub.com/{username}/Spotify-Sentiment-MLOps.mlflow"
)

print("⏳ Đang kéo model từ DagsHub...")
model = mlflow.sklearn.load_model("models:/Spotify_Production_Model/Production")
print("✅ Model đã load thành công!")

# ====== API ======
@app.post("/predict")
def predict(review: str):
    prediction = model.predict([review])[0]
    sentiment = str(prediction)
    # gửi đúng format cho Evidently
    log_data = {
        "data": [
            {
                "text": review,
                "prediction": str(prediction)
            }
        ]
    }

    try:
        requests.post(
            "http://evidently-service:8085/iterate",
            json=log_data,
            timeout=1
        )
    except Exception as e:
        print(f"⚠️ Evidently error: {e}")

    return {
        "review": review,
        "sentiment": sentiment
    }
