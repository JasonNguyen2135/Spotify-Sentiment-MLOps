FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Không cần EXPOSE port vì nó không mở API
CMD ["python", "crawler.py"]
