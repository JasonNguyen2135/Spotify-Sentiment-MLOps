from fastapi import FastAPI
import mlflow.sklearn
import mlflow.tracking
import os
import pika
import json
import time

app = FastAPI(title="Sentiment Analysis Service")

# Configuration
TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
mlflow.set_tracking_uri(TRACKING_URI)

# Cache for loaded models and metadata
models_cache = {}
metadata_cache = {}

def load_model_for_project(project_id: str, target: str = "Production"):
    # Chuẩn hóa project_id (xử lý None, "None", hoặc chuỗi rỗng)
    if not project_id or str(project_id).lower() in ["none", "undefined", "null", ""]:
        project_id = "default"
    else:
        project_id = str(project_id)

    cache_key = f"{project_id}_{target}"
    if cache_key in models_cache:
        return models_cache[cache_key], metadata_cache.get(cache_key, {})

    # Danh sách các tên model có thể thử (theo thứ tự ưu tiên)
    model_names_to_try = [
        f"Sentiment_Analysis_Model_{project_id}",
        "Sentiment_Analysis_Model_default",
        "Sentiment_Analysis_Model",
        "Spotify_Production_Model", # Fallback cho các bản build cũ
        "Spotify_Sentiment_Model"
    ]
    
    client = mlflow.tracking.MlflowClient()
    last_error = None

    for model_name in model_names_to_try:
        try:
            print(f"Đang thử load model: {model_name} (Target: {target})")
            model_uri = f"models:/{model_name}/{target}"
            model = mlflow.sklearn.load_model(model_uri)
            
            meta = {"version": "unknown", "accuracy": "N/A", "run_id": "none", "target": target, "model_name": model_name}
            
            try:
                if target.isdigit():
                    mv = client.get_model_version(model_name, target)
                else:
                    latest_versions = client.get_latest_versions(model_name, stages=[target])
                    mv = latest_versions[0] if latest_versions else None
                    
                if mv:
                    run_id = mv.run_id
                    run = client.get_run(run_id)
                    acc = run.data.metrics.get("accuracy") or run.data.metrics.get("acc")
                    meta["accuracy"] = f"{acc*100:.1f}%" if acc and acc <= 1 else f"{acc:.1f}%" if acc else "N/A"
                    meta["dataset_size"] = run.data.params.get("dataset_size", "N/A")
                    meta["run_id"] = run_id
                    meta["version"] = mv.version
            except Exception as meta_e:
                print(f"Không thể lấy metadata cho {model_name}: {meta_e}")
                
            models_cache[cache_key] = model
            metadata_cache[cache_key] = meta
            print(f"Thành công: Đã load model {model_name}")
            return model, meta
            
        except Exception as e:
            last_error = e
            continue
            
    print(f"Lỗi: Không thể tìm thấy bất kỳ model nào trong danh sách. Lỗi cuối cùng: {last_error}")
    return None, None

def publish_to_queue(log_data):
    try:
        host = os.getenv("RABBITMQ_HOST", "rabbitmq-service")
        credentials = pika.PlainCredentials('guest', 'guest')

        connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host=host,
                port=5672,
                credentials=credentials
            )
        )

        channel = connection.channel()
        channel.queue_declare(queue='prediction_logs')
        channel.basic_publish(
            exchange='',
            routing_key='prediction_logs',
            body=json.dumps(log_data)
        )
        connection.close()

    except Exception as e:
        print(f"Error publishing message to queue: {e}")

@app.get("/")
def health_check(project_id: str = "default"):
    _, meta = load_model_for_project(project_id)
    return {
        "status": "operational", 
        "project_id": project_id,
        "model_info": meta if meta else {"status": "not_loaded", "accuracy": "N/A"}
    }

@app.get("/metadata")
def get_metadata(project_id: str = "default"):
    _, meta = load_model_for_project(project_id)
    if meta:
        return meta
    return {
        "error": "Model not loaded", 
        "accuracy": "N/A", 
        "version": "unknown",
        "project_id": project_id
    }

@app.post("/predict")
def predict(review: str, project_id: str = "default"):
    print(f"Nhận yêu cầu dự đoán cho project: {project_id}")
    model, meta = load_model_for_project(project_id)
    
    if model is None:
        print(f"Lỗi: Không có model cho project {project_id}")
        return {
            "error": "Model not initialized", 
            "project_id": project_id,
            "sentiment": "neutral", # Trả về neutral kèm lỗi để backend biết
            "fallback": True
        }
    
    try:
        # Dự đoán
        prediction = model.predict([review])[0]
        sentiment = str(prediction)
        print(f"Kết quả dự đoán: {sentiment} (Model: {meta.get('model_name')})")
        
        # Log vào queue
        log_data = {
            "text": review,
            "prediction": sentiment,
            "project_id": project_id,
            "model_version": meta.get("version"),
            "timestamp": time.time() if "time" in globals() else None
        }
        publish_to_queue(log_data)
        
        return {
            "input": review, 
            "sentiment": sentiment, 
            "project_id": project_id,
            "model_info": meta
        }
    except Exception as e:
        print(f"Lỗi trong quá trình dự đoán: {e}")
        return {"error": str(e), "sentiment": "neutral"}
