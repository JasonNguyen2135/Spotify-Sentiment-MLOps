import pika
import json
import pandas as pd
from evidently.report import Report
from evidently.metric_preset import DataDriftPreset
from evidently import ColumnMapping
import os
from evidently.ui.workspace import RemoteWorkspace

# Khai báo địa chỉ của con evidently-service trên K8s
EVIDENTLY_URL = os.getenv("EVIDENTLY_URL", "http://evidently-service.mlops-sentiment.svc.cluster.local:8085")
workspace = RemoteWorkspace(EVIDENTLY_URL)

# Tạo một Dự án trên Dashboard (nếu chưa có)
project_name = "Spotify Real-time Sentiment"
project = workspace.search_project(project_name)

if not project:
    project = workspace.create_project(project_name)
    project.description = "Giám sát Data Drift cho dữ liệu luồng từ RabbitMQ"
    workspace.add_project(project)
    print(f"🌟 Đã tạo Project mới trên Dashboard: {project_name}")
else:
    # Do hàm search trả về list, lấy phần tử đầu tiên
    project = project[0]

# CẤU HÌNH CÁI XÔ (WINDOW SIZE)
WINDOW_SIZE = 50
bucket = []
report_counter = 1

# Nạp sẵn tập Tiêu chuẩn (Reference)
REF_FILE_PATH = "reference_data.csv"
DAGSHUB_CSV_URL = "https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/reference_data.csv"

if not os.path.exists(REF_FILE_PATH):
    print(f"📥 Đang tải tập Reference từ DagsHub: {DAGSHUB_CSV_URL}")
    try:
        import requests
        response = requests.get(DAGSHUB_CSV_URL)
        with open(REF_FILE_PATH, 'wb') as f:
            f.write(response.content)
        print("✅ Đã tải file thành công!")
    except Exception as e:
        print(f"❌ Lỗi khi tải file: {e}")

ref_df = pd.read_csv(REF_FILE_PATH)
# 2. TRICK MLOPS: Mượn tạm nhãn thật làm "Dự đoán chuẩn" cho tập Reference
ref_df['prediction'] = ref_df['sentiment']
ref_df = ref_df[['text', 'prediction']]
# 3. CHỈ THEO DÕI PREDICTION VÀ TEXT (Bỏ Target đi)
column_mapping = ColumnMapping(
    prediction="prediction",
    text_features=["text"]
)

def generate_drift_report(current_batch_df, batch_id):
    print(f"\n🔍 ĐANG CHẠY EVIDENTLY CHO LÔ {batch_id}...")

    # 4. Chỉ chạy Data Drift (Nó sẽ tự kiểm tra cả cột text và cột prediction)
    report = Report(metrics=[DataDriftPreset()])

    # So sánh Reference với cái Xô hiện tại
    report.run(reference_data=ref_df, current_data=current_batch_df, column_mapping=column_mapping)

    workspace.add_report(project.id, report)
    # ĐÃ SỬA LỖI TÊN BIẾN Ở ĐÂY:
    print(f"🚨 HOÀN THÀNH! Đã xuất báo cáo cho lô {batch_id} lên Dashboard\n")

def callback(ch, method, properties, body):
    global bucket, report_counter

    # 1. Hứng từng giọt nước
    data = json.loads(body)
    bucket.append(data)
    print(f"💧 Hứng được log. Xô đang có: {len(bucket)}/{WINDOW_SIZE}")

    # 2. Xô đầy -> Kích hoạt Evidently
    if len(bucket) >= WINDOW_SIZE:
        print("🪣 XÔ ĐÃ ĐẦY! Đóng băng dữ liệu để phân tích...")

        # Chuyển xô thành Pandas DataFrame
        df_current = pd.DataFrame(bucket)

        # Chạy báo cáo
        generate_drift_report(df_current, report_counter)

        # 3. Đổ sạch Xô đi, chuẩn bị hứng lô tiếp theo
        bucket.clear()
        report_counter += 1

# --- KẾT NỐI RABBITMQ (ĐÃ DỜI XUỐNG ĐÚNG CHỖ VÀ SỬA CHUẨN) ---
rabbitmq_host = os.getenv("RABBITMQ_HOST", "rabbitmq-service")
print(f"🐰 Đang kết nối tới RabbitMQ tại: {rabbitmq_host}")
connection = pika.BlockingConnection(pika.ConnectionParameters(host=rabbitmq_host))
channel = connection.channel()
channel.queue_declare(queue='prediction_logs')

print("🎧 Monitoring Service đang lắng nghe RabbitMQ...")
channel.basic_consume(queue='prediction_logs', on_message_callback=callback, auto_ack=True)
channel.start_consuming()
