from fastapi import FastAPI
import mlflow.sklearn
import mlflow.tracking
import os
import pika
import json

app = FastAPI(title="Sentiment Analysis Service")

# Configuration
TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
MODEL_TARGET = os.getenv("MODEL_TARGET", "Production") # Can be "Production", "Staging", or a version number like "5"
mlflow.set_tracking_uri(TRACKING_URI)

MODEL_METADATA = {"version": "unknown", "accuracy": "N/A", "run_id": "none", "target": MODEL_TARGET}

print(f"Connecting to MLflow server at {TRACKING_URI}")
try:
    model_name = "Sentiment_Analysis_Model"
    
    # Check if MODEL_TARGET is a numeric version or a stage name
    if MODEL_TARGET.isdigit():
        model_uri = f"models:/{model_name}/{MODEL_TARGET}"
    else:
        model_uri = f"models:/{model_name}/{MODEL_TARGET}"
        
    print(f"Loading model from: {model_uri}")
    model = mlflow.sklearn.load_model(model_uri)
    
    client = mlflow.tracking.MlflowClient()
    
    # Get metadata for the specific target
    if MODEL_TARGET.isdigit():
        mv = client.get_model_version(model_name, MODEL_TARGET)
    else:
        latest_versions = client.get_latest_versions(model_name, stages=[MODEL_TARGET])
        mv = latest_versions[0] if latest_versions else None
        
    if mv:
        run_id = mv.run_id
        run = client.get_run(run_id)
        acc = run.data.metrics.get("accuracy") or run.data.metrics.get("acc")
        MODEL_METADATA["accuracy"] = f"{acc*100:.1f}%" if acc and acc <= 1 else f"{acc:.1f}%" if acc else "N/A"
        MODEL_METADATA["dataset_size"] = run.data.params.get("dataset_size", "N/A")
        MODEL_METADATA["run_id"] = run_id
        MODEL_METADATA["version"] = mv.version
    print(f"Model successfully loaded. Current accuracy: {MODEL_METADATA['accuracy']}")
except Exception as e:
    print(f"Warning: Could not load target model ({MODEL_TARGET}): {e}")
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
