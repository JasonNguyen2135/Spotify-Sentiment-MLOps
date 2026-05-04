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

# Evidently AI imports
from evidently.report import Report
from evidently.metric_preset import DataDriftPreset

# ====== CONFIG ======
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:admin123@postgres:5432/mlops_auth")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
MODEL_API_URL = os.getenv("MODEL_API_URL", "http://model-service:8000")
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key")
ALGORITHM = "HS256"

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
preds_log_col = mongo_db["predictions_log"]

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

    accuracy = "N/A"
    model_version = "v1.2.0-Prod"
    dataset_size = None
    try:
        meta_res = requests.get(f"{MODEL_API_URL}/metadata", timeout=2)
        if meta_res.status_code == 200:
            meta = meta_res.json()
            accuracy = meta.get("accuracy", "N/A")
            model_version = f"v{meta.get('version', '1.2.0')}-Prod"
            dataset_size = meta.get("dataset_size")
    except: pass

    drift_score = "0%"
    try:
        ref_data = pd.DataFrame(list(reviews_col.find().limit(100)))
        curr_data = pd.DataFrame(list(preds_log_col.find().limit(100)))
        if not ref_data.empty and not curr_data.empty:
            drift_report = Report(metrics=[DataDriftPreset()])
            drift_report.run(reference_data=ref_data[['text']], current_data=curr_data[['text']])
            drift_res = drift_report.as_dict()
            share = drift_res["metrics"][0]["result"]["share_of_drifted_columns"]
            drift_score = f"{share * 100:.1f}%"
    except: pass

    try: total_preds = preds_log_col.count_documents({})
    except: total_preds = 0

    if dataset_size is None or dataset_size == "N/A":
        try: 
            crawled_count = reviews_col.count_documents({})
            dataset_size = f"{crawled_count} reviews"
        except: 
            dataset_size = "0 reviews"
    else:
        dataset_size = f"{dataset_size} reviews"

    return {
        "model_version": model_version,
        "total_predictions": total_preds,
        "dataset_size": dataset_size,
        "active_users": user_count,
        "accuracy": accuracy,
        "drift_score": drift_score
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
        preds_log_col.insert_one({
            "text": review_text, "sentiment": result.get("sentiment"),
            "user": current_user.username, "timestamp": datetime.utcnow()
        })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model error: {str(e)}")

@app.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    content = await file.read(); df = pd.read_csv(io.BytesIO(content))
    col = "text" if "text" in df.columns else ("review" if "review" in df.columns else df.columns[0])
    results = []; log_entries = []
    for i, row in df.head(20).iterrows():
        text = str(row[col])
        try:
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text})
            sentiment = res.json().get("sentiment", "Error")
        except: sentiment = "Conn Error"
        results.append({"Câu bình luận": text, "Cảm xúc": sentiment})
        log_entries.append({"text": text, "sentiment": sentiment, "user": current_user.username, "timestamp": datetime.utcnow()})
    if log_entries: preds_log_col.insert_many(log_entries)
    return {"results": results}
