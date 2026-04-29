from fastapi import FastAPI
import mlflow.sklearn
import mlflow.tracking
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

TRACKING_URI = f"https://dagshub.com/{username}/Spotify-Sentiment-MLOps.mlflow"
mlflow.set_tracking_uri(TRACKING_URI)

# Biến toàn cục lưu metadata
MODEL_METADATA = {
    "version": "Production",
    "accuracy": "N/A",
    "run_id": "unknown"
}

print("⏳ Đang kéo model và metadata từ DagsHub...")
try:
    # 1. Load Model
    model_name = "Spotify_Production_Model"
    model = mlflow.sklearn.load_model(f"models:/{model_name}/Production")
    
    # 2. Lấy Accuracy từ Run ID của Model đó
    client = mlflow.tracking.MlflowClient()
    latest_versions = client.get_latest_versions(model_name, stages=["Production"])
    if latest_versions:
        run_id = latest_versions[0].run_id
        run = client.get_run(run_id)
        acc = run.data.metrics.get("accuracy") or run.data.metrics.get("acc") or run.data.metrics.get("val_accuracy")
        
        MODEL_METADATA["accuracy"] = f"{acc*100:.1f}%" if acc and acc <= 1 else f"{acc:.1f}%" if acc else "N/A"
        MODEL_METADATA["run_id"] = run_id
        MODEL_METADATA["version"] = latest_versions[0].version

    print(f"✅ Model loaded. Accuracy: {MODEL_METADATA['accuracy']}")
except Exception as e:
    print(f"⚠️ Error loading model metadata: {e}")
    # Fallback cho model
    model = None

@app.get("/")
def read_root():
    return {"status": "Model service is up", "metadata": MODEL_METADATA}

@app.get("/metadata")
def get_metadata():
    return MODEL_METADATA

@app.post("/predict")
def predict(review: str):
    if model is None:
        return {"error": "Model not loaded"}
    
    prediction = model.predict([review])[0]
    sentiment = str(prediction)
    
    log_data = {"data": [{"text": review, "prediction": sentiment}]}
    try:
        requests.post("http://evidently-service:8085/iterate", json=log_data, timeout=1)
    except: pass

    return {"review": review, "sentiment": sentiment}
