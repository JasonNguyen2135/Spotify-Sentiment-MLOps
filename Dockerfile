# Dùng bản slim cho nhẹ
FROM python:3.10-slim

# Cài đặt git và thư viện cần thiết để mlflow/dvc có thể chạy
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy và cài đặt thư viện
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ code (bao gồm cả file .env để lấy token DagsHub)
COPY . .

# Mở port cho FastAPI
EXPOSE 8000

# Chạy App
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
