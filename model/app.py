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
# New: Environment variable to specify which model this pod serves (e.g., Sentiment_Vip_Model)
POD_MODEL_NAME = os.getenv("MODEL_NAME")
print(f"🚀 Model Service Startup. Target Pod Model: {POD_MODEL_NAME or 'Dynamic/Project-based'}")

# Verify Credentials Presence (Sanitized)
print(f"🔐 AWS_ACCESS_KEY_ID present: {bool(os.getenv('AWS_ACCESS_KEY_ID'))}")
print(f"🔐 AWS_DEFAULT_REGION: {os.getenv('AWS_DEFAULT_REGION', 'not set')}")
print(f"📡 MLFLOW_TRACKING_URI: {TRACKING_URI}")

# Eager loading: Attempt to load the model on startup if POD_MODEL_NAME is set
@app.on_event("startup")
def preload_model():
    if POD_MODEL_NAME:
        print(f"📦 Pre-loading assigned model tier: {POD_MODEL_NAME}...")
        load_model_for_project("default")

# Cache for loaded models and metadata
models_cache = {}
metadata_cache = {}

def load_model_for_project(project_id: str, target: str = "Production"):
    # ... (logic remains same)
    # Normalize project_id
    pid_str = str(project_id).lower()
    is_global = not project_id or pid_str in ["none", "undefined", "null", "", "default", "0"]
    
    if is_global:
        project_id = "default"
    
    # Priority 1: Model name specified for this pod (Global Switcher override)
    if POD_MODEL_NAME:
        model_names_to_try = [POD_MODEL_NAME]
    else:
        # Priority 2: Project-specific models
        model_names_to_try = [f"Sentiment_Analysis_Model_{project_id}"]
    
    # Priority 3: Fallbacks for global/default project
    if is_global and not POD_MODEL_NAME:
        model_names_to_try.extend([
            "Sentiment_Basic_Model",
            "Spotify_Production_Model",
            "Sentiment_Analysis_Model_default"
        ])

    cache_key = f"{model_names_to_try[0]}_{target}"
    if cache_key in models_cache:
        return models_cache[cache_key], metadata_cache.get(cache_key, {})

    client = mlflow.tracking.MlflowClient()
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

                # --- DYNAMIC LOADER SELECTION ---
                if "Vip" in model_name:
                    print(f"💎 Loading Deep Learning model (PyTorch): {model_name}")
                    loaded_model = mlflow.pytorch.load_model(model_uri)
                    from transformers import AutoTokenizer
                    tokenizer = AutoTokenizer.from_pretrained("distilbert-base-uncased")
                    model = {"type": "pytorch", "model": loaded_model, "tokenizer": tokenizer}
                else:
                    print(f"⚡ Loading Classic ML model (Sklearn): {model_name}")
                    loaded_model = mlflow.sklearn.load_model(model_uri)
                    model = {"type": "sklearn", "model": loaded_model}
                
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
        t_start = time.time()

        if model["type"] == "sklearn":
            prediction = model["model"].predict([review])[0]
            sentiment = str(prediction)

            # Calculate confidence if predict_proba is available
            confidence = 1.0
            try:
                if hasattr(model["model"], "predict_proba"):
                    probs = model["model"].predict_proba([review])[0]
                    confidence = float(max(probs))
            except: pass

        elif model["type"] == "pytorch":
            import torch
            import numpy as np

            # Use cached model and tokenizer
            pt_model = model["model"]
            tokenizer = model["tokenizer"]

            # Preprocess
            inputs = tokenizer(review, return_tensors="pt", truncation=True, padding=True, max_length=128)

            # Inference
            pt_model.eval()
            with torch.no_grad():
                outputs = pt_model(**inputs)
                logits = outputs.logits
                probs = torch.nn.functional.softmax(logits, dim=1).numpy()[0]
                pred_idx = np.argmax(probs)
                confidence = float(probs[pred_idx])

            # Map index back to label (0:neg, 1:neu, 2:pos)
            label_map_rev = {0: "negative", 1: "neutral", 2: "positive"}
            sentiment = label_map_rev.get(pred_idx, "neutral")

        inference_duration_ms = (time.time() - t_start) * 1000

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
            "model_info": {
                **meta,
                "inference_time_ms": round(inference_duration_ms, 2)
            }
        }

    except Exception as e:
        print(f"Lỗi trong quá trình dự đoán: {e}")
        return {"error": str(e), "sentiment": "neutral", "confidence": 0.0}
