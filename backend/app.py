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
mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["spotify_db"]
reviews_col = mongo_db["raw_reviews"]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def create_default_admin():
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(username="admin", hashed_password=pwd_context.hash("admin123"), role="admin"))
            db.commit()
    finally: db.close()

create_default_admin()

# QUAN TRỌNG: tokenUrl phải khớp với route login (đã bị ingress cắt /api)
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

@app.get("/")
def read_root():
    return {"status": "Backend is up"}

# ROUTE: register (Ingress gọi /api/register -> Backend nhận /register)
@app.post("/register")
def register(username: str, password: str, role: str = "user", db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    db.add(User(username=username, hashed_password=pwd_context.hash(password), role=role))
    db.commit()
    return {"message": "Success"}

# ROUTE: login (Ingress gọi /api/login -> Backend nhận /login)
@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"access_token": create_access_token(data={"sub": user.username, "role": user.role}), "token_type": "bearer", "role": user.role}

# ROUTE: stats (Ingress gọi /api/stats -> Backend nhận /stats)
@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    user_count = db.query(func.count(User.id)).scalar()
    accuracy = "N/A"
    if DAGSHUB_USER:
        try:
            client = MlflowClient(tracking_uri=TRACKING_URI)
            model_name = "Spotify_Production_Model"
            versions = client.get_latest_versions(model_name, stages=["Production"])
            if versions:
                run = client.get_run(versions[0].run_id)
                acc_val = run.data.metrics.get("accuracy") or run.data.metrics.get("acc") or run.data.metrics.get("val_accuracy")
                if acc_val:
                    accuracy = f"{acc_val * 100:.1f}%" if acc_val <= 1 else f"{acc_val:.1f}%"
        except: pass
    try: crawled_count = reviews_col.count_documents({})
    except: crawled_count = 0
    return {
        "model_version": "v1.2.0-Prod",
        "total_predictions": 14205,
        "dataset_size": f"{crawled_count} reviews",
        "active_users": user_count,
        "accuracy": accuracy
    }

# ROUTE: predict (Ingress gọi /api/predict -> Backend nhận /predict)
@app.post("/predict")
async def predict_single(review_text: str, current_user: User = Depends(get_current_user)):
    try:
        res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text}, timeout=10)
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model error: {str(e)}")

# ROUTE: analyze-csv
@app.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    content = await file.read(); df = pd.read_csv(io.BytesIO(content))
    col = "text" if "text" in df.columns else ("review" if "review" in df.columns else df.columns[0])
    results = []
    for i, row in df.head(10).iterrows():
        try:
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": str(row[col])})
            sentiment = res.json().get("sentiment", "Error")
        except: sentiment = "Conn Error"
        results.append({"Câu bình luận": str(row[col]), "Cảm xúc": sentiment})
    return {"results": results}
