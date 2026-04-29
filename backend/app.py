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

# ====== CONFIG ======
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:admin123@postgres:5432/mlops_auth")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
MODEL_API_URL = os.getenv("MODEL_API_URL", "http://model-service:8000")
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 

# DagsHub / MLflow Config
DAGSHUB_USER = os.getenv("DAGSHUB_USERNAME")
DAGSHUB_PASS = os.getenv("DAGSHUB_PASSWORD")
if DAGSHUB_USER:
    os.environ['MLFLOW_TRACKING_USERNAME'] = DAGSHUB_USER
    os.environ['MLFLOW_TRACKING_PASSWORD'] = DAGSHUB_PASS
    mlflow.set_tracking_uri(f"https://dagshub.com/{DAGSHUB_USER}/Spotify-Sentiment-MLOps.mlflow")

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

mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["spotify_db"]
reviews_col = mongo_db["raw_reviews"]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def create_default_admin():
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            new_admin = User(username="admin", hashed_password=pwd_context.hash("admin123"), role="admin")
            db.add(new_admin)
            db.commit()
    finally: db.close()

create_default_admin()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise HTTPException(status_code=401)
    except JWTError: raise HTTPException(status_code=401)
    user = db.query(User).filter(User.username == username).first()
    if user is None: raise HTTPException(status_code=401)
    return user

# ====== APP ======
app = FastAPI(title="Spotify Backend API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.post("/register")
def register(username: str, password: str, role: str = "user", db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    new_user = User(username=username, hashed_password=pwd_context.hash(password), role=role)
    db.add(new_user)
    db.commit()
    return {"message": "Success"}

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    token = create_access_token(data={"sub": user.username, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role}

@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    user_count = db.query(func.count(User.id)).scalar()
    
    # 1. Lấy Accuracy từ MLflow
    accuracy = "N/A"
    try:
        client = mlflow.tracking.MlflowClient()
        # Tìm version mới nhất của model 'Spotify_Production_Model'
        latest_versions = client.get_latest_versions("Spotify_Production_Model", stages=["Production"])
        if latest_versions:
            run_id = latest_versions[0].run_id
            run = client.get_run(run_id)
            acc_val = run.data.metrics.get("accuracy") or run.data.metrics.get("acc")
            if acc_val:
                accuracy = f"{acc_val * 100:.1f}%" if acc_val <= 1 else f"{acc_val:.1f}%"
    except Exception as e:
        print(f"⚠️ MLflow error: {e}")

    # 2. MongoDB count
    try: crawled_count = reviews_col.count_documents({})
    except: crawled_count = 0
    
    return {
        "model_version": "v1.2.0-Prod",
        "total_predictions": 14205,
        "dataset_size": f"{crawled_count} reviews",
        "active_users": user_count,
        "accuracy": accuracy
    }

# SINGLE PREDICTION API
@app.post("/predict")
async def predict_single(review_text: str, current_user: User = Depends(get_current_user)):
    try:
        res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text}, timeout=10)
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model Service error: {str(e)}")

# BATCH ANALYZE CSV
@app.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    col_name = "text" if "text" in df.columns else ("review" if "review" in df.columns else df.columns[0])
    results = []
    for index, row in df.iterrows():
        text = str(row[col_name])
        try:
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text})
            sentiment = res.json().get("sentiment", "Error")
        except: sentiment = "Conn Error"
        results.append({"Câu bình luận": text, "Cảm xúc": sentiment})
        if index >= 9: break 
    return {"results": results}
