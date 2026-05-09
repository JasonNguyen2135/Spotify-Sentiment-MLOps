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
MLFLOW_URL = os.getenv("MLFLOW_TRACKING_URI", "http://18.140.71.49:5000")
AIRFLOW_URL = os.getenv("AIRFLOW_URL", "http://airflow-webserver:8080")
AIRFLOW_AUTH = os.getenv("AIRFLOW_AUTH", "admin:admin")
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
mongo_db = mongo_client["sentiment_db"]
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
app = FastAPI(title="SentimentAI Orchestrator API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

from fastapi import APIRouter
api_router = APIRouter()

@api_router.get("/stats")
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
            dataset_size = f"{crawled_count} records"
        except: 
            dataset_size = "0 records"
    else:
        dataset_size = f"{dataset_size} records"

    return {
        "model_version": model_version,
        "total_predictions": total_preds,
        "dataset_size": dataset_size,
        "active_users": user_count,
        "accuracy": accuracy,
        "drift_score": drift_score
    }

# NEW: Dataset Management
@api_router.get("/datasets")
def get_datasets(current_user: User = Depends(get_current_user)):
    return [
        {"name": "Real-time MongoDB Feed", "source": "mongodb://raw_reviews", "count": reviews_col.count_documents({})},
        {"name": "Production Baseline v1.0", "source": "https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/spotify_db.raw_reviews.csv", "count": 12500},
        {"name": "Curated Evaluation Set", "source": "local://eval.csv", "count": 1200}
    ]

# NEW: Model Management (MLflow Proxy)
@api_router.get("/models")
def get_models(current_user: User = Depends(get_current_user)):
    try:
        res = requests.get(
            f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/search",
            params={"filter": "name='Spotify_Production_Model'"},
            timeout=5
        )
        if res.status_code == 200:
            versions = res.json().get("model_versions", [])
            return sorted(versions, key=lambda x: int(x['version']), reverse=True)
        return []
    except Exception as e:
        print(f"MLflow error: {e}")
        return []

@api_router.post("/deploy-model")
def deploy_model(version: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        payload = {
            "name": "Spotify_Production_Model",
            "version": version,
            "stage": "Production",
            "archive_existing_versions": True
        }
        requests.post(f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/transition-stage", json=payload, timeout=5)
        return {"status": "success", "message": f"Version {version} promoted to Production"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# NEW: Training Orchestration (Airflow Proxy)
@api_router.post("/train")
def trigger_training(dataset_source: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        import base64
        auth_header = base64.b64encode(AIRFLOW_AUTH.encode('ascii')).decode('ascii')
        payload = {"conf": {"data_source": dataset_source}}
        res = requests.post(
            f"{AIRFLOW_URL}/api/v1/dags/spotify_sentiment_train_k8s_native/dagRuns",
            json=payload,
            headers={"Authorization": f"Basic {auth_header}"},
            timeout=10
        )
        if res.status_code in [200, 201]:
            return {"status": "success", "dag_run_id": res.json().get("dag_run_id")}
        else:
            raise HTTPException(status_code=res.status_code, detail=res.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/user-history")
def get_user_history(current_user: User = Depends(get_current_user)):
    # Fetch last 50 predictions for the logged-in user
    cursor = preds_log_col.find({"user": current_user.username}).sort("timestamp", -1).limit(50)
    history = []
    for doc in cursor:
        history.append({
            "text": doc.get("text"),
            "sentiment": doc.get("sentiment"),
            "timestamp": doc.get("timestamp").isoformat() if doc.get("timestamp") else None
        })
    return history

@api_router.get("/monthly-analytics")
def get_monthly_analytics(current_user: User = Depends(get_current_user)):
    # ... (existing aggregate pipeline)
    pipeline = [
        {
            "$group": {
                "_id": {
                    "month": {"$month": "$timestamp"},
                    "year": {"$year": "$timestamp"},
                    "sentiment": "$sentiment"
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]
    cursor = preds_log_col.aggregate(pipeline)
    results = {}
    for doc in cursor:
        key = f"{doc['_id']['year']}-{doc['_id']['month']:02d}"
        if key not in results:
            results[key] = {"positive": 0, "negative": 0, "neutral": 0}
        results[key][doc["_id"]["sentiment"]] = doc["count"]
    
    formatted_data = []
    for date, counts in results.items():
        formatted_data.append({"date": date, **counts})
    
    return sorted(formatted_data, key=lambda x: x["date"])

@api_router.get("/word-cloud")
def get_word_cloud(current_user: User = Depends(get_current_user)):
    # Simple word frequency from the last 1000 reviews
    cursor = preds_log_col.find().sort("timestamp", -1).limit(1000)
    word_counts = {}
    stop_words = set(["the", "a", "an", "is", "are", "was", "were", "to", "for", "in", "on", "at", "by", "with", "platform", "app", "feedback"])
    
    for doc in cursor:
        words = str(doc.get("text", "")).lower().split()
        for word in words:
            word = "".join(filter(str.isalnum, word))
            if word and word not in stop_words and len(word) > 3:
                word_counts[word] = word_counts.get(word, 0) + 1
    
    sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:50]
    return [{"text": w, "value": c} for w, c in sorted_words]

@api_router.post("/register")
def register(username: str, password: str, role: str = "user", db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    db.add(User(username=username, hashed_password=pwd_context.hash(password), role=role))
    db.commit()
    return {"message": "Success"}

@api_router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"access_token": create_access_token(data={"sub": user.username, "role": user.role}), "token_type": "bearer", "role": user.role}

@api_router.post("/predict")
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

@api_router.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    
    # Identify the text column
    col = "text" if "text" in df.columns else ("review" if "review" in df.columns else (df.columns[0]))
    
    # Identify the date column
    date_col = None
    for c in df.columns:
        if "date" in c.lower() or "timestamp" in c.lower():
            date_col = c
            break

    results = []
    log_entries = []
    
    # Process up to 500 rows for analysis
    for i, row in df.head(500).iterrows():
        text = str(row[col])
        timestamp = datetime.utcnow()
        
        if date_col:
            try:
                timestamp = pd.to_datetime(row[date_col])
                if pd.isna(timestamp):
                    timestamp = datetime.utcnow()
            except:
                pass
                
        try:
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text}, timeout=5)
            sentiment = res.json().get("sentiment", "neutral")
        except:
            sentiment = "neutral"
            
        results.append({"text": text, "sentiment": sentiment, "timestamp": timestamp.isoformat()})
        log_entries.append({
            "text": text, 
            "sentiment": sentiment, 
            "user": current_user.username, 
            "timestamp": timestamp
        })
        
    if log_entries:
        preds_log_col.insert_many(log_entries)
        
    return {"results": results}

# Include router at root and with /api prefix
app.include_router(api_router)
app.include_router(api_router, prefix="/api")
