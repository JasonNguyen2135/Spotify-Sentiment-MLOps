import schedule
import time
import os
from datetime import datetime
from pymongo import MongoClient
from google_play_scraper import Sort, reviews

# ====== KẾT NỐI MONGODB ======
# Lấy URL từ biến môi trường của K8s/Docker, nếu không có thì dùng mặc định
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client = MongoClient(MONGO_URL)
db = client["spotify_db"]
collection = db["raw_reviews"]

def crawl_spotify_data():
    print(f"[{datetime.now()}] 🚀 Bắt đầu cào 500 review mới nhất của Spotify...")
    
    try:
        # Cào 500 đánh giá mới nhất của app Spotify trên CH Play
        result, continuation_token = reviews(
            'com.spotify.music',
            lang='vi', # Cào tiếng Việt (hoặc đổi thành 'en' cho tiếng Anh)
            country='vn', 
            sort=Sort.NEWEST, # Lấy 500 dòng mới nhất
            count=500 
        )

        new_data = []
        for item in result:
            # Tự động gán nhãn (Auto-labeling) dựa trên số sao (rating)
            # >= 4 sao là Tích cực (1), ngược lại là Tiêu cực (0)
            label = "positive" if item['score'] >= 4 else "negative"
            
            # Ép kiểu CHUẨN cho Evidently AI
            review_doc = {
                "review_id": str(item['reviewId']),
                "text": str(item['content']), # Ép kiểu String
                "sentiment": str(label),          # Ép kiểu Integer (Quan trọng!)
                "rating": int(item['score']),
                "timestamp": item['at']
            }
            new_data.append(review_doc)

        if new_data:
            # Tùy chọn: Xóa data cũ để luôn giữ 500 dòng mới nhất cho mỗi lần train
            collection.delete_many({}) 
            
            # Lưu vào MongoDB
            collection.insert_many(new_data)
            print(f"[{datetime.now()}] ✅ Đã lưu thành công {len(new_data)} reviews chuẩn format vào MongoDB!")
        else:
            print(f"[{datetime.now()}] ⚠️ Không cào được dữ liệu nào.")

    except Exception as e:
        print(f"[{datetime.now()}] ❌ Lỗi Crawler: {e}")

# ====== LÊN LỊCH CHẠY ======
# Mỗi tuần cào 1 lần vào 0h sáng thứ Hai
schedule.every().monday.at("00:00").do(crawl_spotify_data)

# Test chạy thử ngay khi khởi động Pod
print("Crawler Service is starting...")
crawl_spotify_data()

# Vòng lặp giữ Pod sống và chờ đến lịch
while True:
    schedule.run_pending()
    time.sleep(60)
