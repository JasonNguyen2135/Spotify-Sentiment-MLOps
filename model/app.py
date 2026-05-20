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
        f"Sentiment_Analysis_Model_{project_id}"
    ]
    
    # Chỉ thêm fallback nếu không phải project cụ thể hoặc project_id là default
    if project_id == "default":
        model_names_to_try.extend([
            "Sentiment_Analysis_Model_default",
            "Sentiment_Analysis_Model",
            "Spotify_Production_Model",
            "Spotify_Sentiment_Model"
        ])
    
    client = mlflow.tracking.MlflowClient()
    last_error = None

    for model_name in model_names_to_try:
        # Danh sách các stage để thử load
        targets_to_try = [target]
        if target != "Production": targets_to_try.append("Production")
        targets_to_try.append("Staging")
        targets_to_try.append(None) # None nghĩa là lấy version mới nhất không kể stage

        for current_target in targets_to_try:
            try:
                if current_target:
                    print(f"Đang thử load model: {model_name} (Target: {current_target})")
                    model_uri = f"models:/{model_name}/{current_target}"
                else:
                    print(f"Đang thử load model: {model_name} (Phiên bản mới nhất)")
                    # Lấy version mới nhất từ client
                    all_versions = client.get_latest_versions(model_name, stages=["Production", "Staging", "None"])
                    if not all_versions:
                        # Thử lấy tất cả versions nếu không tìm thấy version nào có stage
                        all_versions = client.search_model_versions(f"name='{model_name}'")
                    
                    if all_versions:
                        # Sắp xếp theo version giảm dần
                        latest_v = sorted(all_versions, key=lambda x: int(x.version), reverse=True)[0]
                        model_uri = f"models:/{model_name}/{latest_v.version}"
                        print(f"Tìm thấy version mới nhất: {latest_v.version}")
                    else:
                        continue

                model = mlflow.sklearn.load_model(model_uri)
                
                meta = {"version": "unknown", "accuracy": "N/A", "run_id": "none", "target": str(current_target), "model_name": model_name}
                
                try:
                    # Lấy metadata
                    if current_target and str(current_target).isdigit():
                        mv = client.get_model_version(model_name, current_target)
                    elif current_target:
                        lvs = client.get_latest_versions(model_name, stages=[current_target])
                        mv = lvs[0] if lvs else None
                    else:
                        mv = latest_v if 'latest_v' in locals() else None
                        
                    if mv:
                        run_id = mv.run_id
                        run = client.get_run(run_id)
                        acc = run.data.metrics.get("accuracy") or run.data.metrics.get("acc")
                        meta["accuracy"] = f"{acc*100:.1f}%" if acc and acc <= 1 else f"{acc:.1f}%" if acc else "N/A"
                        meta["dataset_size"] = run.data.params.get("dataset_size", "N/A")
                        meta["run_id"] = run_id
                        meta["version"] = mv.version
                except Exception as meta_e:
                    print(f"Không thể lấy metadata: {meta_e}")
                    
                models_cache[cache_key] = model
                metadata_cache[cache_key] = meta
                print(f"Thành công: Đã load model {model_name} từ URI {model_uri}")
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
            "sentiment": "neutral", 
            "confidence": 0.0,
            "fallback": True
        }
    
    try:
        # Predict class
        prediction = model.predict([review])[0]
        sentiment = str(prediction)
        
        # Calculate confidence if predict_proba is available
        confidence = 1.0
        try:
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba([review])[0]
                confidence = float(max(probs))
        except: pass

        print(f"Kết quả dự đoán: {sentiment} ({confidence*100:.1f}%) (Model: {meta.get('model_name')})")
        
        # Log into queue
        log_data = {
            "text": review,
            "prediction": sentiment,
            "confidence": confidence,
            "project_id": project_id,
            "model_version": meta.get("version"),
            "timestamp": time.time()
        }
        publish_to_queue(log_data)
        
        return {
            "input": review, 
            "sentiment": sentiment, 
            "confidence": confidence,
            "project_id": project_id,
            "model_info": meta
        }
    except Exception as e:
        print(f"Lỗi trong quá trình dự đoán: {e}")
        return {"error": str(e), "sentiment": "neutral", "confidence": 0.0}
