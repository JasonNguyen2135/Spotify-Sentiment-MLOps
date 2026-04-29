from fastapi import FastAPI, Request
import pandas as pd
import os
from evidently.ui.workspace import Workspace
from evidently.report import Report
from evidently.metric_preset import DataDriftPreset, TargetDriftPreset
from evidently.test_preset import DataDriftTestPreset

app = FastAPI()
WORKSPACE_PATH = "workspace"
PROJECT_NAME = "Spotify Sentiment Monitoring"

# Khởi tạo Workspace sạch
if not os.path.exists(WORKSPACE_PATH):
    os.makedirs(WORKSPACE_PATH)

ws = Workspace.create(WORKSPACE_PATH)

def get_or_create_project():
    project = ws.search_project(PROJECT_NAME)
    if not project:
        project = ws.create_project(PROJECT_NAME)
        project.description = "Giám sát hiệu năng Model và Data Drift"
        project.save()
        return project
    return project[0]

@app.post("/iterate")
async def iterate(request: Request):
    data = await request.json()
    new_df = pd.DataFrame(data["data"])
    
    project = get_or_create_project()
    
    # Tạo Report
    report = Report(metrics=[
        DataDriftPreset(),
        TargetDriftPreset()
    ])
    
    # Ở đây chúng ta tạm dùng chính dữ liệu mới làm reference để demo
    # Trong thực tế nên load file reference.csv từ lúc train
    report.run(reference_data=new_df, current_data=new_df)
    
    ws.add_report(project.id, report)
    return {"status": "ok", "project_id": str(project.id)}

if __name__ == "__main__":
    import uvicorn
    # 8085 cho API, UI chạy lệnh evidently ui riêng
    uvicorn.run(app, host="0.0.0.0", port=8085)
