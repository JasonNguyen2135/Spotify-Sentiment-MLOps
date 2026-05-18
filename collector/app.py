from fastapi import FastAPI, HTTPException
import redis
import json
import os
from datetime import datetime

app = FastAPI(title="Sentiment Collector Gateway")

# Configuration
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT_VAL", 6379))
QUEUE_NAME = "sentiment_webhook_queue"

# Init Redis
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/collect/{project_id}")
async def collect_comment(project_id: int, data: dict):
    """
    Receive comment with optional timestamp and push to MQ.
    """
    comment_text = data.get("text") or data.get("review_text")
    if not comment_text:
        raise HTTPException(status_code=400, detail="Missing 'text' field")

    # Capture timestamp from client or use current UTC time
    timestamp = data.get("timestamp") or datetime.utcnow().isoformat()

    payload = {
        "project_id": project_id,
        "text": comment_text,
        "user_id": data.get("user_id", "anonymous"),
        "timestamp": timestamp,
        "source": data.get("source", "webhook_v2"),
        "rating": data.get("rating"),
        "app_version": data.get("version") or data.get("app_version")
    }

    try:
        r.lpush(QUEUE_NAME, json.dumps(payload))
        return {
            "status": "Accepted", 
            "message": "Data queued",
            "metadata": {"project_id": project_id, "timestamp": timestamp}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MQ Error: {str(e)}")
