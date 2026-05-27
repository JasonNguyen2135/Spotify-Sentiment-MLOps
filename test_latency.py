import requests
import time
import numpy as np
import pandas as pd
import os

# ==========================================
# ⚙️ CẤU HÌNH HỆ THỐNG
# ==========================================
BASE_URL = "http://localhost:8000/api"
USERNAME = "admin"
PASSWORD = "admin123" 
PROJECT_ID = 0

TIERS = ["basic", "standard", "pro", "premium", "vip"]
BATCH_SIZES = [1, 10, 100, 1000]

def get_token():
    print("🔑 Đang lấy token đăng nhập...")
    try:
        res = requests.post(f"{BASE_URL}/login", 
                             data={"username": USERNAME, "password": PASSWORD},
                             headers={"Content-Type": "application/x-www-form-urlencoded"},
                             timeout=10)
        return res.json().get("access_token")
    except Exception as e:
        print(f"❌ Lỗi kết nối Backend: {e}")
        return None

def switch_tier(token, tier):
    print(f"\n🔄 Đang chuyển hệ thống sang tầng: {tier.upper()}...")
    try:
        requests.post(f"{BASE_URL}/system/config?model_key={tier}", 
                      headers={"Authorization": f"Bearer {token}"},
                      timeout=10)
        time.sleep(3) # Đợi hệ thống ổn định cấu hình
    except:
        print(f"⚠️ Cảnh báo: Không thể chuyển sang tầng {tier}")

def run_load_test():
    token = get_token()
    if not token:
        print("❌ Dừng benchmark vì không có token.")
        return

    results = []

    for tier in TIERS:
        switch_tier(token, tier)
        tier_results = {"Tier": tier.upper()}
        
        for size in BATCH_SIZES:
            print(f"   🚀 Đang test tải: {size} request(s)...")
            latencies = []
            
            t_start_batch = time.time()
            for i in range(size):
                try:
                    # Tăng timeout cho tầng VIP khi chạy lô lớn
                    timeout = 30 if tier != "vip" else 120
                    res = requests.post(f"{BASE_URL}/predict?review_text=amazing%20app&project_id={PROJECT_ID}",
                                        headers={"Authorization": f"Bearer {token}"},
                                        timeout=timeout)

                    if res.status_code == 200:
                        ms = res.json().get("model_info", {}).get("inference_time_ms", 0)
                        latencies.append(ms)
                    else:
                        latencies.append(5000) 
                except:
                    latencies.append(10000)

                # Thêm thanh tiến độ cho các lô lớn
                if size >= 100 and (i + 1) % (size // 5) == 0:
                    print(f"      🔹 Tiến độ: {i+1}/{size} requests...", flush=True)

            t_end_batch = time.time()
            
            # Tính toán chỉ số
            avg_lat = np.mean(latencies)
            p95_lat = np.percentile(latencies, 95)
            throughput = size / (t_end_batch - t_start_batch)

            tier_results[f"Avg_Lat_{size}"] = round(avg_lat, 2)
            tier_results[f"p95_Lat_{size}"] = round(p95_lat, 2)
            tier_results[f"Throughput_{size}"] = round(throughput, 1)

        results.append(tier_results)

    # --- XUẤT DỮ LIỆU ---
    df = pd.DataFrame(results)
    
    # 1. Xuất CSV
    csv_file = 'latency_report.csv'
    df.to_csv(csv_file, index=False, encoding='utf-8-sig')
    print(f"\n✅ Đã lưu file CSV: {os.path.abspath(csv_file)}")

    # 2. Xuất Excel (Cần cài: pip install openpyxl)
    try:
        excel_file = 'latency_report.xlsx'
        df.to_excel(excel_file, index=False)
        print(f"✅ Đã lưu file Excel: {os.path.abspath(excel_file)}")
    except ImportError:
        print("💡 Lưu ý: Hãy chạy 'pip install openpyxl' để xuất được file Excel.")

    print("\n" + "="*80)
    print("📊 TÓM TẮT KẾT QUẢ BENCHMARK")
    print("="*80)
    print(df.to_string(index=False))
    print("="*80)

if __name__ == "__main__":
    run_load_test()
