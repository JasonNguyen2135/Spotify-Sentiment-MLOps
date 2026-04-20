import streamlit as st
import pandas as pd
import requests
import os

# Lấy địa chỉ Backend từ biến môi trường (Docker Compose cấu hình)
BACKEND_URL = os.getenv("BACKEND_API_URL", "http://localhost:8000")

st.title("🎵 Spotify Sentiment Analyzer")
st.write("Tải lên file CSV chứa bình luận Spotify để máy học phân tích cảm xúc!")

uploaded_file = st.file_uploader("Chọn file CSV", type=["csv"])

if uploaded_file is not None:
    st.write("Đang phân tích...")
    # Gửi file tới Backend
    files = {"file": (uploaded_file.name, uploaded_file.getvalue(), "text/csv")}
    response = requests.post(f"{BACKEND_URL}/analyze-csv", files=files)
    
    if response.status_code == 200:
        st.success("Hoàn thành!")
        results = response.json().get("results", [])
        
        # Hiển thị kết quả ra bảng
        df_results = pd.DataFrame(results)
        st.dataframe(df_results)
    else:
        st.error(f"Có lỗi xảy ra: {response.text}")
