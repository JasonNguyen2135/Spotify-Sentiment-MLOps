from fastapi import FastAPI
import mlflow.sklearn
import mlflow.tracking
import os
import pika
import json

app = FastAPI(title="Model Prediction Service")

# ====== LOAD ENV ======
TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://47.129.38.134:5000")
mlflow.set_tracking_uri(TRACKING_URI)

MODEL_METADATA = {"version": "Production", "accuracy": "N/A", "run_id": "unknown"}

print(f"⏳ Đang kéo model và metadata từ MLflow Server tại {TRACKING_URI}...")
try:
    model_name = "Spotify_Production_Model"
    model = mlflow.sklearn.load_model(f"models:/{model_name}/Production")
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
    model = None

# ====== HELPER: BẮN LOG VÀO RABBITMQ ======
# ====== HELPER: BẮN LOG VÀO RABBITMQ ======
def publish_to_rabbitmq(log_data):
    try:
        # 1. SỬA TÊN HOST MẶC ĐỊNH THÀNH rabbitmq-service
        host = os.getenv("RABBITMQ_HOST", "rabbitmq-service")
        
        # 2. DÙNG TÀI KHOẢN MẶC ĐỊNH CỦA RABBITMQ (guest/guest)
        credentials = pika.PlainCredentials('guest', 'guest')

        connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host=host,
                port=5672,
                credentials=credentials
            )
        )

        channel = connection.channel()

        # 3. ĐỒNG BỘ CẤU HÌNH QUEUE VỚI CONSUMER (XÓA BỎ durable=True)
        channel.queue_declare(queue='prediction_logs')

        # gửi message
        channel.basic_publish(
            exchange='',
            routing_key='prediction_logs',
            body=json.dumps(log_data)
        )

        connection.close()

    except Exception as e:
        print(f"⚠️ Thất bại khi bắn log vào RabbitMQ: {e}")
@app.get("/")
def read_root(): return {"status": "Model service is up", "metadata": MODEL_METADATA}

@app.get("/metadata")
def get_metadata(): return MODEL_METADATA

@app.post("/predict")
def predict(review: str):
    if model is None: return {"error": "Model not loaded"}
    
    # 1. AI làm việc: Dự đoán kết quả
    prediction = model.predict([review])[0]
    sentiment = str(prediction)
    
    # 2. Đóng gói log (Giống y hệt cấu trúc thằng Consumer bên kia đang hứng)
    log_data = {
        "text": review,
        "prediction": sentiment
    }
    
    # 3. Kẻ nhả dữ liệu (Producer): Bắn thẳng vào RabbitMQ
    publish_to_rabbitmq(log_data)
    
    return {"review": review, "sentiment": sentiment}
