import pandas as pd
from pymongo import MongoClient

def export_mongo_to_csv():
    # 1. Kết nối tới MongoDB
    try:
        client = MongoClient('mongodb://localhost:27017/')
        db = client['spotify_db']
        collection = db['raw_reviews']
        
        # 2. Lấy toàn bộ dữ liệu từ collection
        # Chúng ta chỉ lấy các trường cần thiết để file CSV gọn nhẹ
        cursor = collection.find({}, {
            '_id': 0, 
            'userName': 1, 
            'content': 1, 
            'score': 1, 
            'at': 1, 
            'thumbsUpCount': 1
        })
        
        # 3. Chuyển đổi sang Pandas DataFrame
        df = pd.DataFrame(list(cursor))
        
        if df.empty:
            print("⚠️ Không có dữ liệu trong MongoDB để xuất!")
            return

        # 4. Tiền xử lý nhẹ (tùy chọn)
        # Sắp xếp theo thời gian mới nhất
        df = df.sort_values(by='at', ascending=False)

        # 5. Lưu thành file CSV
        output_file = 'spotify_reviews_raw.csv'
        df.to_csv(output_file, index=False, encoding='utf-8-sig') # utf-8-sig để đọc được tiếng Việt trong Excel
        
        print(f"✅ Đã xuất thành công {len(df)} dòng dữ liệu ra file: {output_file}")

    except Exception as e:
        print(f"❌ Lỗi khi xuất dữ liệu: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    export_mongo_to_csv()
