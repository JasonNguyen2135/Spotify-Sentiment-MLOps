import time
import os
import psutil
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import ComplementNB
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, f1_score, classification_report
import lightgbm as lgb
import warnings
warnings.filterwarnings('ignore')

# --- 1. Tạo dữ liệu giả lập để test nhanh (Bạn có thể thay bằng dữ liệu lấy từ MongoDB) ---
print("🚀 Đang chuẩn bị dữ liệu Benchmark...")
np.random.seed(42)
N_SAMPLES = 10000
# Giả lập text dài khoảng 20 từ
dummy_texts = [" ".join(np.random.choice(["good", "bad", "okay", "terrible", "awesome", "battery", "screen", "app", "crash", "love"], 20)) for _ in range(N_SAMPLES)]
dummy_labels = np.random.choice(["positive", "negative", "neutral"], N_SAMPLES, p=[0.5, 0.3, 0.2])

X_train, X_test, y_train, y_test = train_test_split(dummy_texts, dummy_labels, test_size=0.2, random_state=42)

# --- 2. Định nghĩa 5 Mô hình ---
models = {
    "Basic (CompNB)": ComplementNB(alpha=0.5),
    "Standard (LogReg)": LogisticRegression(max_iter=100, solver='lbfgs', n_jobs=-1),
    "Pro (LightGBM)": lgb.LGBMClassifier(n_estimators=100, max_depth=5, n_jobs=-1, verbose=-1),
    "Premium (MLP)": MLPClassifier(hidden_layer_sizes=(64,), max_iter=50, early_stopping=True)
}

# (Bỏ qua DistilBERT trong script test nhanh này vì chạy trên CPU sẽ mất hàng tiếng đồng hồ. 
# Bạn có thể lấy số liệu DistilBERT từ MLflow sau khi train thực tế).

results_table1 = []
results_table2 = []
results_table3 = []

process = psutil.Process(os.getpid())

print("\n" + "="*50)
print("BẮT ĐẦU BENCHMARK 4 TẦNG MÔ HÌNH (Bỏ qua VIP vì quá nặng)")
print("="*50)

for name, clf in models.items():
    print(f"\n👉 Đang xử lý: {name}...")
    
    # Tạo Pipeline
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(max_features=10000, ngram_range=(1,2))),
        ('clf', clf)
    ])
    
    # --- ĐO BẢNG 2: CHI PHÍ HUẤN LUYỆN ---
    mem_before = process.memory_info().rss / (1024 * 1024)
    start_time = time.time()
    
    pipeline.fit(X_train, y_train)
    
    train_time = time.time() - start_time
    mem_after = process.memory_info().rss / (1024 * 1024)
    peak_ram = mem_after - mem_before
    
    # Lưu file để đo kích thước
    import joblib
    model_path = f"{name.split()[0]}.pkl"
    joblib.dump(pipeline, model_path)
    model_size = os.path.getsize(model_path) / (1024 * 1024) # MB
    os.remove(model_path) # Xóa file tạm
    
    results_table2.append({
        "Tầng": name,
        "Thời gian Train (s)": round(train_time, 2),
        "Đỉnh RAM (MB)": round(max(peak_ram, 10), 1), # Ước lượng
        "Kích thước Model (MB)": round(model_size, 2)
    })
    
    # --- ĐO BẢNG 1: HIỆU NĂNG PHÂN LOẠI ---
    preds = pipeline.predict(X_test)
    acc = accuracy_score(y_test, preds)
    macro_f1 = f1_score(y_test, preds, average='macro')
    report = classification_report(y_test, preds, output_dict=True)
    
    results_table1.append({
        "Tầng": name,
        "Accuracy": round(acc, 4),
        "Macro-F1": round(macro_f1, 4),
        "F1-Negative": round(report.get('negative', {}).get('f1-score', 0), 4),
        "F1-Neutral": round(report.get('neutral', {}).get('f1-score', 0), 4)
    })
    
    # --- ĐO BẢNG 3: ĐỘ TRỄ SUY LUẬN (LATENCY) ---
    def measure_latency(batch_size):
        batch_data = X_test[:batch_size]
        latencies = []
        for _ in range(5): # Chạy 5 lần lấy trung bình
            t0 = time.time()
            pipeline.predict(batch_data)
            latencies.append((time.time() - t0) * 1000) # đổi sang ms
        return np.mean(latencies)
    
    lat_1 = measure_latency(1)
    lat_100 = measure_latency(100)
    lat_1000 = measure_latency(1000)
    
    results_table3.append({
        "Tầng": name,
        "1 Req (ms)": round(lat_1, 2),
        "Batch 100 (ms)": round(lat_100, 2),
        "Batch 1000 (ms)": round(lat_1000, 2)
    })

print("\n" + "="*50)
print("📊 BẢNG 1: KẾT QUẢ HIỆU NĂNG PHÂN LOẠI")
print(pd.DataFrame(results_table1).to_string(index=False))

print("\n" + "="*50)
print("📊 BẢNG 2: CHI PHÍ TÀI NGUYÊN HUẤN LUYỆN")
print(pd.DataFrame(results_table2).to_string(index=False))

print("\n" + "="*50)
print("📊 BẢNG 3: ĐỘ TRỄ PHỤC VỤ (LATENCY)")
print(pd.DataFrame(results_table3).to_string(index=False))
print("="*50)
