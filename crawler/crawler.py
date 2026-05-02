import schedule
import time
import os
from datetime import datetime
from pymongo import MongoClient
from google_play_scraper import Sort, reviews

# ====== KẾT NỐI MONGODB ======
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
client = MongoClient(MONGO_URL)
db = client["spotify_db"]
collection = db["raw_reviews"]

def crawl_spotify_data():
    # Tạo tên collection theo ngày chạy: data_ngay_thang_nam
    current_date = datetime.now().strftime("%d_%m_%Y")
    collection_name = f"data_{current_date}"
    collection = db[collection_name]
    
    print(f"[{datetime.now()}] 🚀 Bắt đầu cào 1000 review mới nhất vào collection: {collection_name}...")
    try:
        # Cào 1000 review
        result, _ = reviews('com.spotify.music', lang='vi', country='vn', sort=Sort.NEWEST, count=1000)
        new_data = []
        for item in result:
            label = "positive" if item['score'] >= 4 else "negative"
            new_data.append({
                "review_id": str(item['reviewId']),
                "text": str(item['content']),
                "sentiment": str(label),
                "rating": int(item['score']),
                "timestamp": item['at']
            })
        if new_data:
            # Không xóa cái cũ nữa, lưu vào collection mới hoàn toàn
            collection.insert_many(new_data)
            print(f"[{datetime.now()}] ✅ Đã lưu thành công {len(new_data)} reviews vào {collection_name}!")
    except Exception as e:
        print(f"[{datetime.now()}] ❌ Lỗi Crawler: {e}")

# Chạy vào mỗi thứ 2 hàng tuần
schedule.every().monday.at("00:00").do(crawl_spotify_data)
crawl_spotify_data()

while True:
    schedule.run_pending()
    time.sleep(60)
