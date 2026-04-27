import os
import pandas as pd
from fastapi import FastAPI
from evidently.ui.workspace import Workspace
from evidently.report import Report
from evidently.metric_preset import DataDriftPreset
from evidently import ColumnMapping
import threading

app = FastAPI(title="Evidently Collector Service")

# 1. Khởi tạo Workspace (Database của UI)
WORKSPACE_DIR = "workspace"
ws = Workspace.create(WORKSPACE_DIR)
project = ws.create_project("Spotify Sentiment Drift")
project.description = "Giám sát lệch dữ liệu cho Model"
project.save()

# 2. Tạo Reference Data (Dữ liệu gốc lúc Train)
# Tạm thời tạo data giả, sau này Trinh mount file train.csv thật vào đây nhé!
if not os.path.exists("reference.csv"):
    pd.DataFrame({
        "text": ["nghe hay", "app lag quá", "nhạc chất lượng", "quảng cáo nhiều", "trải nghiệm tuyệt vời"],
        "prediction": ["positive", "negative", "positive", "negative", "positive"]
    }).to_csv("reference.csv", index=False)

reference_data = pd.read_csv("reference.csv")
current_buffer = [] # Bộ nhớ đệm gom request

@app.post("/iterate")
def receive_data(payload: dict):
    global current_buffer
    # Hứng data từ Model Service của Trinh
    row = payload["data"][0]
    current_buffer.append(row)
    
    # Gom đủ 5 log thì xuất 1 bản Report lên UI (Tránh tính toán liên tục gây lag)
    if len(current_buffer) >= 5:
        df_current = pd.DataFrame(current_buffer)
        current_buffer.clear()
        
        # Chạy phân tích ở luồng riêng (Background Thread)
        threading.Thread(target=generate_report, args=(df_current,)).start()
        
    return {"status": "ok", "buffered": len(current_buffer)}

def generate_report(current_data):
    # Cấu hình để Evidently hiểu cột nào là text
    col_map = ColumnMapping(text_features=["text"], prediction="prediction")
    
    # Tính toán Data Drift
    report = Report(metrics=[DataDriftPreset()])
    report.run(reference_data=reference_data, current_data=current_data, column_mapping=col_map)
    
    # Lưu Snapshot lên Web UI
    ws.add_snapshot(project.id, report.to_snapshot())
    print("✅ Đã phát hiện và tạo Snapshot mới trên Evidently UI!")
