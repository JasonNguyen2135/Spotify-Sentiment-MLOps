from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import Column, Integer, String, create_engine, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import requests
import os
import io
from pymongo import MongoClient
import mlflow
from mlflow.tracking import MlflowClient

# ====== CONFIG ======
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:admin123@postgres:5432/mlops_auth")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
MODEL_API_URL = os.getenv("MODEL_API_URL", "http://model-service:8000")
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key")
ALGORITHM = "HS256"

# DagsHub / MLflow Config
DAGSHUB_USER = os.getenv("DAGSHUB_USERNAME")
DAGSHUB_PASS = os.getenv("DAGSHUB_PASSWORD")
TRACKING_URI = f"https://dagshub.com/{DAGSHUB_USER}/Spotify-Sentiment-MLOps.mlflow"

if DAGSHUB_USER:
    os.environ['MLFLOW_TRACKING_USERNAME'] = DAGSHUB_USER
    os.environ['MLFLOW_TRACKING_PASSWORD'] = DAGSHUB_PASS
    mlflow.set_tracking_uri(TRACKING_URI)

# ====== DATABASE SETUP ======
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="user")

Base.metadata.create_all(bind=engine)

# MongoDB Connection
mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["spotify_db"]
reviews_col = mongo_db["raw_reviews"]
preds_log_col = mongo_db["predictions_log"] # Lưu log dự đoán để đếm

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def create_default_admin():
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(username="admin", hashed_password=pwd_context.hash("admin123"), role="admin"))
            db.commit()
    finally: db.close()

create_default_admin()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_db():
    db = SessionLocal(); yield db; db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(days=1)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.query(User).filter(User.username == payload.get("sub")).first()
        if not user: raise HTTPException(status_code=401)
        return user
    except: raise HTTPException(status_code=401)

# ====== APP ======
app = FastAPI(title="Spotify Backend API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    user_count = db.query(func.count(User.id)).scalar()
    
    # 1. Lấy Accuracy từ MLflow (Cải tiến logic tìm kiếm)
    accuracy = "N/A"
    if DAGSHUB_USER:
        try:
            client = MlflowClient(tracking_uri=TRACKING_URI)
            # Thử tìm theo Model Registry trước
            try:
                versions = client.get_latest_versions("Spotify_Production_Model", stages=["Production"])
                if versions:
                    run = client.get_run(versions[0].run_id)
                    acc_val = run.data.metrics.get("accuracy") or run.data.metrics.get("acc")
                    if acc_val: accuracy = f"{acc_val * 100:.1f}%" if acc_val <= 1 else f"{acc_val:.1f}%"
            except:
                # Nếu Registry lỗi, tìm trong Experiment
                runs = mlflow.search_runs(order_by=["metrics.accuracy DESC"], max_results=1)
                if not runs.empty:
                    acc_val = runs.iloc[0].get("metrics.accuracy") or runs.iloc[0].get("metrics.acc")
                    if acc_val: accuracy = f"{acc_val * 100:.1f}%" if acc_val <= 1 else f"{acc_val:.1f}%"
        except: pass

    # 2. Đếm số lượng dự đoán thật từ MongoDB
    try: total_preds = preds_log_col.count_documents({})
    except: total_preds = 0

    # 3. Dataset size
    try: crawled_count = reviews_col.count_documents({})
    except: crawled_count = 0
    
    return {
        "model_version": "v1.2.0-Prod",
        "total_predictions": total_preds, # CON SỐ THẬT
        "dataset_size": f"{crawled_count} reviews",
        "active_users": user_count,
        "accuracy": accuracy
    }

@app.post("/register")
def register(username: str, password: str, role: str = "user", db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    db.add(User(username=username, hashed_password=pwd_context.hash(password), role=role))
    db.commit()
    return {"message": "Success"}

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"access_token": create_access_token(data={"sub": user.username, "role": user.role}), "token_type": "bearer", "role": user.role}

@app.post("/predict")
async def predict_single(review_text: str, current_user: User = Depends(get_current_user)):
    try:
        res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text}, timeout=10)
        result = res.json()
        # LƯU LOG VÀO MONGODB ĐỂ TĂNG TOTAL PREDICTIONS
        preds_log_col.insert_one({
            "text": review_text,
            "sentiment": result.get("sentiment"),
            "user": current_user.username,
            "timestamp": datetime.utcnow()
        })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model error: {str(e)}")

@app.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    content = await file.read(); df = pd.read_csv(io.BytesIO(content))
    col = "text" if "text" in df.columns else ("review" if "review" in df.columns else df.columns[0])
    results = []
    log_entries = []
    
    for i, row in df.head(20).iterrows(): # Tăng lên 20 dòng cho máu
        text = str(row[col])
        try:
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text})
            sentiment = res.json().get("sentiment", "Error")
        except: sentiment = "Conn Error"
        
        results.append({"Câu bình luận": text, "Cảm xúc": sentiment})
        # Chuẩn bị log để insert batch
        log_entries.append({
            "text": text, "sentiment": sentiment, "user": current_user.username, "timestamp": datetime.utcnow()
        })

    # Lưu hàng loạt vào MongoDB
    if log_entries:
        preds_log_col.insert_many(log_entries)
        
    return {"results": results}
