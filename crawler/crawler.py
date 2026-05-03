import schedule
import time
import os
from datetime import datetime
from pymongo import MongoClient
from google_play_scraper import Sort, reviews

# Database Connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
client = MongoClient(MONGO_URL)
db = client["spotify_db"]

def collect_reviews():
    # Define collection name based on execution date
    timestamp = datetime.now().strftime("%d_%m_%Y")
    collection_name = f"data_{timestamp}"
    collection = db[collection_name]
    
    print(f"Beginning collection of latest reviews into: {collection_name}")
    try:
        # Fetch data from source
        result, _ = reviews('com.spotify.music', lang='vi', country='vn', sort=Sort.NEWEST, count=1000)
        batch = []
        for item in result:
            sentiment_label = "positive" if item['score'] >= 4 else "negative"
            batch.append({
                "review_id": str(item['reviewId']),
                "text": str(item['content']),
                "sentiment": str(sentiment_label),
                "rating": int(item['score']),
                "timestamp": item['at']
            })
        
        if batch:
            # Store batch in database
            collection.insert_many(batch)
            print(f"Stored {len(batch)} entries in {collection_name}")
            
    except Exception as e:
        print(f"Data collection failed: {e}")

# Scheduled execution for weekly updates
schedule.every().monday.at("00:00").do(collect_reviews)

# Initial execution on startup
collect_reviews()

while True:
    schedule.run_pending()
    time.sleep(60)
