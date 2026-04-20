from fastapi import FastAPI, UploadFile, File
import pandas as pd
import requests
import os
import io

app = FastAPI(title="Spotify Backend API")

# Trỏ tới Model Service nội bộ
MODEL_API_URL = os.getenv("MODEL_API_URL", "http://model-service:8000")

@app.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...)):
    # Đọc file CSV người dùng gửi
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    
    # Cột chứa bình luận mặc định là 'review' (tùy file của bạn)
    col_name = "review" if "review" in df.columns else df.columns[0]
    
    results = []
    # Gọi sang Model Service cho từng dòng (Thực tế nên tối ưu gọi theo batch)
    for index, row in df.iterrows():
        text = str(row[col_name])
        try:
            # Gọi API của Model Service
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text})
            sentiment = res.json().get("sentiment", "Lỗi")
        except:
            sentiment = "Không kết nối được Model"
            
        results.append({"Câu bình luận": text, "Cảm xúc": sentiment})
        
        # Giới hạn test 10 dòng đầu cho nhanh
        if index >= 9: break 

    return {"results": results}
