import pandas as pd
from sklearn.model_selection import train_test_split
import os

def split_and_save_data():
    # 1. Nạp cái kho báu của bạn lên
    print("⏳ Đang đọc dữ liệu gốc...")
    df = pd.read_csv('spotify_reviews.csv')
    total_samples = len(df)
    print(f"📊 Tổng số sample ban đầu: {total_samples}")

    # 2. CẮT LẦN 1: Tách 15% ra làm tập Current (Thực tế)
    # Tham số stratify=df['sentiment'] giúp giữ nguyên tỷ lệ positive/negative
    df_temp, df_current = train_test_split(
        df, 
        test_size=0.15, 
        random_state=42, 
        stratify=df['sentiment']
    )

    # 3. CẮT LẦN 2: Lấy 85% còn lại (df_temp) tách tiếp thành Train và Reference
    # Để Reference chiếm đúng 15% tổng ban đầu, tỷ lệ cắt là: 15 / 85 = ~0.1765
    df_train, df_reference = train_test_split(
        df_temp, 
        test_size=0.1765, 
        random_state=42, 
        stratify=df_temp['sentiment']
    )

    # In ra báo cáo quân số
    print("\n✅ ĐÃ CHIA XONG! KIỂM TRA QUÂN SỐ:")
    print(f"🛠️ 1. Train Set (Sklearn học): {len(df_train)} dòng (~70%)")
    print(f"⚖️ 2. Reference Set (Tiêu chuẩn cho Evidently): {len(df_reference)} dòng (~15%)")
    print(f"🕵️ 3. Current Set (Test Drift cho Evidently): {len(df_current)} dòng (~15%)")

    # 4. Xuất kho thành 3 file riêng biệt
    df_train.to_csv('train_data.csv', index=False)
    df_reference.to_csv('reference_data.csv', index=False)
    df_current.to_csv('current_data.csv', index=False)
    
    print("\n💾 Đã lưu thành 3 file: train_data.csv, reference_data.csv, current_data.csv")

if __name__ == "__main__":
    split_and_save_data()
