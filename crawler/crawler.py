import schedule
import time
import os
import requests
from datetime import datetime
from pymongo import MongoClient
from sqlalchemy import create_engine, text
from google_play_scraper import Sort, reviews

# Configuration
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:admin123@postgres:5432/mlops_auth")
MODEL_API_URL = os.getenv("MODEL_API_URL", "http://model-service:8000") # Call model service directly

# Database Connections
pg_engine = create_engine(DATABASE_URL)
mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["sentiment_db"]
preds_log_col = mongo_db["predictions_log"]

def process_all_sources():
    print(f"[{datetime.now()}] Starting dynamic ingestion cycle...")
    
    try:
        with pg_engine.connect() as conn:
            result = conn.execute(text("SELECT id, app_id, project_id, platform FROM data_sources WHERE status = 'active'"))
            sources = result.fetchall()
            
        for source_id, app_id, project_id, platform in sources:
            print(f"Processing App: {app_id} (Project: {project_id})")
            sync_source(app_id, project_id, platform)
            
    except Exception as e:
        print(f"Cycle failed: {e}")

def sync_source(app_id, project_id, platform, limit=500):
    try:
        if platform == 'Google Play':
            # Fetch Newest and Most Relevant to get better distribution
            res_new, _ = reviews(app_id, lang='en', country='us', sort=Sort.NEWEST, count=limit // 2)
            res_rel, _ = reviews(app_id, lang='en', country='us', sort=Sort.MOST_RELEVANT, count=limit // 2)
            result = res_new + res_rel
        else:
            print(f"Platform {platform} not supported yet for auto-crawl.")
            return

        seen_ids = set()
        batch = []
        for item in result:
            if item['reviewId'] in seen_ids: continue
            seen_ids.add(item['reviewId'])
            
            text_content = str(item['content'])
            item_ts = item['at']
            print(f"[DEBUG] Processing background crawl review at {item_ts}")
            
            # Call Model Service directly for sentiment
            try:
                res = requests.post(
                    f"{MODEL_API_URL}/predict", 
                    params={"review": text_content, "project_id": str(project_id)}, 
                    timeout=10
                )
                sentiment = res.json().get("sentiment", "neutral")
            except Exception as e:
                print(f"[DEBUG] Prediction failed: {e}")
                sentiment = "neutral"
                
            batch.append({
                "text": text_content,
                "sentiment": sentiment,
                "source": f"auto_crawl_{platform}",
                "project_id": project_id,
                "user": "system_crawler",
                "timestamp": item_ts or datetime.utcnow(),
                "rating": item.get('score'),
                "app_version": item.get('reviewCreatedVersion')
            })
        
        if batch:
            # Avoid duplicates by checking text + timestamp? 
            # Simplified for now: just insert
            preds_log_col.insert_many(batch)
            print(f"Synced {len(batch)} new records for {app_id}")
            
    except Exception as e:
        print(f"Sync failed for {app_id}: {e}")

# Scheduled execution for daily updates
schedule.every().day.at("00:00").do(process_all_sources)

# Initial execution on startup
process_all_sources()

while True:
    schedule.run_pending()
    time.sleep(60)
