from fastapi import FastAPI
import mlflow.sklearn
import mlflow.tracking
import os
import pika
import json

app = FastAPI(title="Sentiment Analysis Service")

# Configuration
TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://47.129.38.134:5000")
mlflow.set_tracking_uri(TRACKING_URI)

MODEL_METADATA = {"version": "stable", "accuracy": "N/A", "run_id": "none"}

print(f"Connecting to MLflow server at {TRACKING_URI}")
try:
    model_name = "Spotify_Production_Model"
    model = mlflow.sklearn.load_model(f"models:/{model_name}/Production")
    client = mlflow.tracking.MlflowClient()
    latest_versions = client.get_latest_versions(model_name, stages=["Production"])
    if latest_versions:
        run_id = latest_versions[0].run_id
        run = client.get_run(run_id)
        acc = run.data.metrics.get("accuracy") or run.data.metrics.get("acc")
        MODEL_METADATA["accuracy"] = f"{acc*100:.1f}%" if acc and acc <= 1 else f"{acc:.1f}%" if acc else "N/A"
        MODEL_METADATA["run_id"] = run_id
        MODEL_METADATA["version"] = latest_versions[0].version
    print(f"Model successfully loaded. Current accuracy: {MODEL_METADATA['accuracy']}")
except Exception as e:
    print(f"Warning: Could not load production model: {e}")
    model = None

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
def health_check():
    return {"status": "operational", "model_info": MODEL_METADATA}

@app.get("/metadata")
def get_metadata():
    return MODEL_METADATA

@app.post("/predict")
def predict(review: str):
    if model is None:
        return {"error": "Service unavailable: Model not initialized"}
    
    # Generate prediction
    prediction = model.predict([review])[0]
    sentiment = str(prediction)
    
    # Log event for monitoring
    log_data = {
        "text": review,
        "prediction": sentiment
    }
    publish_to_queue(log_data)
    
    return {"input": review, "sentiment": sentiment}
