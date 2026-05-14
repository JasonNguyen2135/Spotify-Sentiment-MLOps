from fastapi import FastAPI
import mlflow.sklearn
import mlflow.tracking
import os
import pika
import json

app = FastAPI(title="Sentiment Analysis Service")

# Configuration
TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
mlflow.set_tracking_uri(TRACKING_URI)

# Cache for loaded models and metadata
models_cache = {}
metadata_cache = {}

def load_model_for_project(project_id: str, target: str = "Production"):
    cache_key = f"{project_id}_{target}"
    if cache_key in models_cache:
        return models_cache[cache_key], metadata_cache.get(cache_key, {})

    model_name = f"Sentiment_Analysis_Model_{project_id}"
    print(f"Attempting to load model: {model_name} (Target: {target})")
    
    try:
        model_uri = f"models:/{model_name}/{target}"
        model = mlflow.sklearn.load_model(model_uri)
        
        client = mlflow.tracking.MlflowClient()
        meta = {"version": "unknown", "accuracy": "N/A", "run_id": "none", "target": target}
        
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
            
        models_cache[cache_key] = model
        metadata_cache[cache_key] = meta
        print(f"Successfully loaded model {model_name}")
        return model, meta
    except Exception as e:
        print(f"Warning: Could not load model {model_name}: {e}")
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
    return {"status": "operational", "model_info": meta or "Model not loaded"}

@app.get("/metadata")
def get_metadata(project_id: str = "default"):
    _, meta = load_model_for_project(project_id)
    return meta or {"error": "Model not loaded"}

@app.post("/predict")
def predict(review: str, project_id: str = "default"):
    model, _ = load_model_for_project(project_id)
    if model is None:
        return {"error": f"Service unavailable: Model for project {project_id} not initialized"}
    
    # Generate prediction
    prediction = model.predict([review])[0]
    sentiment = str(prediction)
    
    # Log event for monitoring
    log_data = {
        "text": review,
        "prediction": sentiment,
        "project_id": project_id
    }
    publish_to_queue(log_data)
    
    return {"input": review, "sentiment": sentiment}
