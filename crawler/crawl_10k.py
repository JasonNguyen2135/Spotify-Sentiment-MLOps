import os
from google_play_scraper import Sort, reviews
from pymongo import MongoClient
from datetime import datetime
import pandas as pd

# Configuration
APP_ID = 'com.spotify.music'
MAX_COUNT = 10000
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")

def crawl_and_label():
    print(f"🚀 Starting crawl for {MAX_COUNT} reviews from app: {APP_ID}...")
    
    try:
        # Fetch reviews
        result, _ = reviews(
            APP_ID,
            lang='en', # English for consistent sentiment
            country='us',
            sort=Sort.NEWEST,
            count=MAX_COUNT
        )
        
        print(f"✅ Successfully scraped {len(result)} reviews.")
        
        # Connect to MongoDB
        client = MongoClient(MONGO_URL)
        db = client["sentiment_db"]
        collection = db["predictions_log"] # Insert here to make them visible in History
        
        # Process and Label
        batch = []
        for item in result:
            score = item['score']
            # Simple Rule-based Labeling
            if score >= 4:
                sentiment = "positive"
            elif score <= 2:
                sentiment = "negative"
            else:
                sentiment = "neutral"
                
            batch.append({
                "text": item['content'],
                "sentiment": sentiment,
                "project_id": 0, # Global HUB project
                "user": "auto_crawler_10k",
                "timestamp": item['at'],
                "source": "bulk_importer",
                "model_version": "Human-Labeled (Proxy)",
                "rating": score,
                "app_version": item['reviewCreatedVersion']
            })
            
        if batch:
            print(f"📦 Inserting {len(batch)} records into MongoDB...")
            collection.insert_many(batch)
            print("✨ Done! Data is now ready for training.")
        else:
            print("⚠️ No data found to insert.")
            
    except Exception as e:
        print(f"❌ Error during crawl: {e}")

if __name__ == "__main__":
    crawl_and_label()
