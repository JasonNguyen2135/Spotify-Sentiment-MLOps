FROM registry.ntdevopsregistry.io.vn/mlops/sentiment-base:latest

WORKDIR /app

# Vì thư viện đã có sẵn trong Base Image, ta chỉ cần copy code
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
