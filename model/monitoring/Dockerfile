FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# CÀI THẲNG TAY KHÔNG CẦN FILE REQUIREMENT
RUN pip install --no-cache-dir pika==1.3.2 pandas==2.2.2 evidently==0.4.33 scikit-learn

COPY ./monitoring/monitoring_service_consumer.py .
COPY dataset/reference_data.csv ./dataset/

CMD ["python", "monitoring_service_consumer.py"]
