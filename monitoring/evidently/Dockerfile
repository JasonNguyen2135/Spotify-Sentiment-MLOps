FROM python:3.10-slim

WORKDIR /app

# Cài đặt thư viện
RUN pip install fastapi uvicorn pandas evidently==0.4.33

# Copy code vào
COPY app.py .
COPY start.sh .
RUN chmod +x start.sh

# Mở 2 cổng
EXPOSE 8085 8086

# Chạy script
CMD ["./start.sh"]
