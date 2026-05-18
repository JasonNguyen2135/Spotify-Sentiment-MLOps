FROM python:3.10-slim

WORKDIR /app

# Cài đặt phiên bản ổn định
RUN pip install fastapi uvicorn pandas evidently==0.4.33

COPY app.py .
COPY start.sh .
RUN chmod +x start.sh

# Tạo thư mục workspace sạch
RUN mkdir -p /app/workspace

EXPOSE 8085 8086

CMD ["./start.sh"]
