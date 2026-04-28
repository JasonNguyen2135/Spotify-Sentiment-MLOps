import threading
import requests
import time
import os

# Cấu hình tăng cường để kích hoạt HPA
URL = "http://spotify-mlops.local/api/analyze-csv"
FILE_PATH = "spotify_db.raw_reviews.csv"
NUM_THREADS = 40  # Tăng lên 40 luồng để đẩy CPU lên cao
DURATION = 300    # Chạy trong 5 phút để K8s có thời gian quan sát

def send_request(thread_id):
    print(f"🧵 Thread {thread_id} started")
    count = 0
    start_time = time.time()
    
    while time.time() - start_time < DURATION:
        try:
            with open(FILE_PATH, 'rb') as f:
                # Gửi file CSV
                files = {'file': (os.path.basename(FILE_PATH), f, 'text/csv')}
                response = requests.post(URL, files=files, timeout=60)
                
            if response.status_code == 200:
                count += 1
                if count % 5 == 0: # Chỉ in log mỗi 5 request để tránh nghẽn terminal
                    print(f"✅ Thread {thread_id}: Completed {count} requests")
            else:
                print(f"❌ Thread {thread_id}: Error {response.status_code}")
        except Exception as e:
            # Nếu server overload và từ chối kết nối, đợi 1 giây rồi thử lại
            time.sleep(1)
    
    print(f"🏁 Thread {thread_id} finished. Total: {count}")

if __name__ == "__main__":
    if not os.path.exists(FILE_PATH):
        print(f"❌ Không tìm thấy file {FILE_PATH}.")
        exit(1)

    print(f"🔥 BẮT ĐẦU STRESS TEST CƯỜNG ĐỘ CAO 🔥")
    print(f"Thời gian: {DURATION} giây | Luồng: {NUM_THREADS}")
    print(f"Mục tiêu: {URL}")
    print("Hãy mở terminal khác và chạy: kubectl get pods -n mlops-sentiment -w")
    print("---------------------------------------------------------")

    threads = []
    for i in range(NUM_THREADS):
        t = threading.Thread(target=send_request, args=(i,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    print("---------------------------------------------------------")
    print("✅ Chiến dịch Stress Test kết thúc.")
