import os
import requests
import json
from google_play_scraper import Sort, reviews
from datetime import datetime
import time

# Configuration
APP_ID = 'com.spotify.music'
MAX_COUNT = 1000
# Update to point to the Collector service
COLLECTOR_URL = os.getenv("COLLECTOR_URL", "http://localhost:8000/collect/0")

def crawl_and_dispatch():
    print(f"🚀 Starting crawl for {MAX_COUNT} reviews from app: {APP_ID}...")
    print(f"🔗 Target Collector: {COLLECTOR_URL}")
    
    try:
        # Fetch reviews
        result, _ = reviews(
            APP_ID,
            lang='en',
            country='us',
            sort=Sort.NEWEST,
            count=MAX_COUNT
        )
        
        print(f"✅ Successfully scraped {len(result)} reviews.")
        
        success_count = 0
        for item in result:
            payload = {
                "text": item['content'],
                "rating": item['score'],
                "app_version": item['reviewCreatedVersion'],
                "source": "google_play_crawler",
                "timestamp": item['at'].isoformat() if isinstance(item['at'], datetime) else str(item['at'])
            }
            
            try:
                # Dispatch to Collector -> Redis Queue
                res = requests.post(COLLECTOR_URL, json=payload, timeout=5)
                if res.status_code == 202 or res.status_code == 200:
                    success_count += 1
                
                # Small sleep to avoid overwhelming the gateway during local testing
                if success_count % 100 == 0:
                    print(f"📡 Dispatched {success_count} items to Collector...")
                    time.sleep(1)
            except Exception as dispatch_err:
                print(f"⚠️ Failed to dispatch record: {dispatch_err}")
                
        print(f"✨ Finished! Successfully dispatched {success_count}/{len(result)} records to the MLOps Pipeline.")
            
    except Exception as e:
        print(f"❌ Error during crawl: {e}")

if __name__ == "__main__":
    crawl_and_dispatch()
