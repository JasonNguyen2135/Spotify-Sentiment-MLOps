from fastapi import FastAPI, HTTPException
import redis
import json
import os

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
    Lightweight endpoint to receive comments and push to MQ.
    """
    comment_text = data.get("review_text") or data.get("text")
    if not comment_text:
        raise HTTPException(status_code=400, detail="Missing text field")

    payload = {
        "project_id": project_id,
        "text": comment_text,
        "user_id": data.get("user_id", "anonymous"),
        "source": data.get("source", "webhook_v2")
    }

    try:
        # Push to Redis List (acting as a simple queue)
        r.lpush(QUEUE_NAME, json.dumps(payload))
        return {
            "status": "Accepted", 
            "message": "Data queued for processing",
            "project_id": project_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MQ Error: {str(e)}")
