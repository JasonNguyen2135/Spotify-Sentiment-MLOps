from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import Column, Integer, String, create_engine, func, DateTime
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

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class DataSource(Base):
    __tablename__ = "data_sources"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, index=True)
    platform = Column(String)
    app_id = Column(String) # Removed unique constraint to allow same app in different projects
    schedule = Column(String, default="daily") # daily, weekly, monthly
    status = Column(String, default="active")

class AlertRule(Base):
    __tablename__ = "alert_rules"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, index=True)
    name = Column(String)
    threshold = Column(Integer) # e.g. 25 for 25%
    channel = Column(String) # Telegram, Email, Slack
    destination = Column(String) # Chat ID or Email

Base.metadata.create_all(bind=engine)

def migrate_db():
    db = SessionLocal()
    try:
        if not db.query(Project).first():
            default_project = Project(name="Default Workspace", description="Automatically created workspace for existing data.")
            db.add(default_project)
            db.commit()
            db.refresh(default_project)
            
            # Link existing SQL records
            db.query(DataSource).update({DataSource.project_id: default_project.id})
            db.query(AlertRule).update({AlertRule.project_id: default_project.id})
            db.commit()

            # Link existing MongoDB records
            try:
                preds_log_col.update_many({"project_id": {"$exists": False}}, {"$set": {"project_id": default_project.id}})
                reviews_col.update_many({"project_id": {"$exists": False}}, {"$set": {"project_id": default_project.id}})
            except Exception as e:
                print(f"MongoDB Migration error: {e}")
    finally:
        db.close()

migrate_db()

# ... (rest of setup)
mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["sentiment_db"]
reviews_col = mongo_db["raw_reviews"]
preds_log_col = mongo_db["predictions_log"]
feedback_col = mongo_db["human_feedback"]

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
def get_stats(project_id: int = None, db: Session = Depends(get_db)):
    user_count = db.query(func.count(User.id)).scalar()
    
    if project_id is None:
        return {"model_version": "N/A", "total_predictions": 0, "dataset_size": "0 records", "active_users": user_count, "accuracy": "N/A", "drift_score": "0%"}

    query = {"project_id": project_id}
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
        ref_data = pd.DataFrame(list(reviews_col.find(query).limit(100)))
        curr_data = pd.DataFrame(list(preds_log_col.find(query).limit(100)))
        if not ref_data.empty and not curr_data.empty:
            drift_report = Report(metrics=[DataDriftPreset()])
            drift_report.run(reference_data=ref_data[['text']], current_data=curr_data[['text']])
            drift_res = drift_report.as_dict()
            share = drift_res["metrics"][0]["result"]["share_of_drifted_columns"]
            drift_score = f"{share * 100:.1f}%"
    except: pass

    try: total_preds = preds_log_col.count_documents(query)
    except: total_preds = 0

    if dataset_size is None or dataset_size == "N/A":
        try: 
            crawled_count = reviews_col.count_documents(query)
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

# NEW: Project Management
@api_router.get("/projects")
def get_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Project).all()

@api_router.post("/projects")
def create_project(name: str, description: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if db.query(Project).filter(Project.name == name).first():
        raise HTTPException(status_code=400, detail="Project name exists")
    project = Project(name=name, description=description)
    db.add(project)
    db.commit()
    return project

# NEW: Dataset Management
@api_router.get("/datasets")
def get_datasets(project_id: int = None, current_user: User = Depends(get_current_user)):
    query = {"project_id": project_id} if project_id else {}
    return [
        {"name": "Project Live Stream", "source": f"mongodb://{project_id}", "count": preds_log_col.count_documents(query)},
        {"name": "Enterprise Baseline v1.0", "source": "https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/spotify_db.raw_reviews.csv", "count": 12500}
    ]

# NEW: Model Management (MLflow Proxy)
@api_router.get("/models")
def get_models(project_id: int = None, current_user: User = Depends(get_current_user)):
    try:
        # Use project name or ID to filter models in MLflow
        model_name = f"Sentiment_Analysis_Model_{project_id}" if project_id else "Sentiment_Analysis_Model"
        res = requests.get(
            f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/search",
            params={"filter": f"name='{model_name}'"},
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
def deploy_model(version: str, project_id: int = None, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        model_name = f"Sentiment_Analysis_Model_{project_id}" if project_id else "Sentiment_Analysis_Model"
        payload = {
            "name": model_name,
            "version": version,
            "stage": "Production",
            "archive_existing_versions": True
        }
        requests.post(f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/transition-stage", json=payload, timeout=5)
        return {"status": "success", "message": f"Version {version} promoted to Production"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# NEW: Training Orchestration (Airflow Proxy)
@api_router.get("/airflow/runs")
def get_airflow_runs(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        import base64
        auth_header = base64.b64encode(AIRFLOW_AUTH.encode('ascii')).decode('ascii')
        res = requests.get(
            f"{AIRFLOW_URL}/api/v1/dags/sentiment_analysis_training/dagRuns?limit=10&order_by=-execution_date",
            headers={"Authorization": f"Basic {auth_header}"},
            timeout=5
        )
        if res.status_code == 200:
            return res.json().get("dag_runs", [])
        return []
    except Exception as e:
        print(f"Airflow error: {e}")
        return []

@api_router.get("/airflow/logs/{dag_run_id}")
def get_airflow_logs(dag_run_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        import base64
        auth_header = base64.b64encode(AIRFLOW_AUTH.encode('ascii')).decode('ascii')
        # Task ID is hardcoded based on the DAG definition
        task_id = "model_training_pipeline"
        # 1. Get task instances to find the try_number
        ti_res = requests.get(
            f"{AIRFLOW_URL}/api/v1/dags/sentiment_analysis_training/dagRuns/{dag_run_id}/taskInstances/{task_id}",
            headers={"Authorization": f"Basic {auth_header}"},
            timeout=5
        )
        if ti_res.status_code != 200:
            return {"logs": "Task instance not found or still queued..."}
        
        try_number = ti_res.json().get("try_number", 1)
        
        # 2. Fetch logs
        log_res = requests.get(
            f"{AIRFLOW_URL}/api/v1/dags/sentiment_analysis_training/dagRuns/{dag_run_id}/taskInstances/{task_id}/logs/{try_number}",
            headers={"Authorization": f"Basic {auth_header}"},
            timeout=10
        )
        return {"logs": log_res.text}
    except Exception as e:
        return {"logs": f"Error fetching logs: {str(e)}"}

@api_router.post("/train")
def trigger_training(dataset_source: str, project_id: int = None, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        import base64
        auth_header = base64.b64encode(AIRFLOW_AUTH.encode('ascii')).decode('ascii')
        payload = {
            "conf": {
                "data_source": dataset_source,
                "project_id": project_id
            }
        }
        res = requests.post(
            f"{AIRFLOW_URL}/api/v1/dags/sentiment_analysis_training/dagRuns",
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
def get_user_history(project_id: int = None, current_user: User = Depends(get_current_user)):
    if project_id is None: return []
    query = {"user": current_user.username, "project_id": project_id}
    
    cursor = preds_log_col.find(query).sort("timestamp", -1).limit(50)
    history = []
    for doc in cursor:
        history.append({
            "text": doc.get("text"),
            "sentiment": doc.get("sentiment"),
            "timestamp": doc.get("timestamp").isoformat() if doc.get("timestamp") else None
        })
    return history

@api_router.get("/monthly-analytics")
def get_monthly_analytics(project_id: int = None, current_user: User = Depends(get_current_user)):
    if project_id is None: return []
    match_query = {"project_id": project_id}
    
    pipeline = [
        {"$match": match_query},
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
        if not doc['_id'].get('year') or not doc['_id'].get('month'): continue
        key = f"{doc['_id']['year']}-{doc['_id']['month']:02d}"
        if key not in results:
            results[key] = {"positive": 0, "negative": 0, "neutral": 0}
        sentiment = doc['_id'].get('sentiment', 'neutral')
        results[key][sentiment] = doc["count"]
    
    formatted_data = []
    for date, counts in results.items():
        formatted_data.append({"date": date, **counts})
    
    return sorted(formatted_data, key=lambda x: x["date"])

@api_router.get("/comparison")
def get_comparison(project_id: int = None, current_user: User = Depends(get_current_user)):
    if project_id is None: return None
    now = datetime.utcnow()
    this_month_start = datetime(now.year, now.month, 1)
    last_month_end = this_month_start - timedelta(days=1)
    last_month_start = datetime(last_month_end.year, last_month_end.month, 1)

    def get_counts(start, end):
        match_query = {"timestamp": {"$gte": start, "$lte": end}, "project_id": project_id}
        
        pipeline = [
            {"$match": match_query},
            {"$group": {"_id": "$sentiment", "count": {"$sum": 1}}}
        ]
        cursor = preds_log_col.aggregate(pipeline)
        res = {"positive": 0, "negative": 0, "neutral": 0, "total": 0}
        for doc in cursor:
            if doc['_id'] in res:
                res[doc['_id']] = doc['count']
                res['total'] += doc['count']
        return res

    current = get_counts(this_month_start, now)
    previous = get_counts(last_month_start, last_month_end)

    return {
        "current": current,
        "previous": previous,
        "delta_positive": current['positive'] - previous['positive'],
        "delta_negative": current['negative'] - previous['negative'],
        "total_growth": ((current['total'] - previous['total']) / previous['total'] * 100) if previous['total'] > 0 else 0
    }

@api_router.get("/word-cloud")
def get_word_cloud(sentiment: str = None, project_id: int = None, current_user: User = Depends(get_current_user)):
    if project_id is None: return []
    query = {"project_id": project_id}
    if sentiment: query["sentiment"] = sentiment
    
    cursor = preds_log_col.find(query).sort("timestamp", -1).limit(2000)
    word_counts = {}
    stop_words = set(["the", "a", "an", "is", "are", "was", "were", "to", "for", "in", "on", "at", "by", "with", "platform", "app", "feedback", "spotify", "music"])
    
    for doc in cursor:
        words = str(doc.get("text", "")).lower().split()
        for word in words:
            word = "".join(filter(str.isalnum, word))
            if word and word not in stop_words and len(word) > 3:
                word_counts[word] = word_counts.get(word, 0) + 1
    
    sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:50]
    return [{"text": w, "value": c} for w, c in sorted_words]

@api_router.post("/correction")
def submit_correction(prediction_id: str = None, text: str = None, corrected_sentiment: str = None, project_id: int = None, current_user: User = Depends(get_current_user)):
    # Store user feedback for future retraining
    entry = {
        "text": text,
        "corrected_sentiment": corrected_sentiment,
        "user": current_user.username,
        "timestamp": datetime.utcnow(),
        "original_id": prediction_id,
        "project_id": project_id
    }
    feedback_col.insert_one(entry)
    return {"status": "success", "message": "Feedback recorded. Thank you!"}

@api_router.post("/predict")
async def predict_single(review_text: str, project_id: int = None, current_user: User = Depends(get_current_user)):
    try:
        res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text}, timeout=10)
        result = res.json()
        preds_log_col.insert_one({
            "text": review_text, "sentiment": result.get("sentiment"),
            "user": current_user.username, "timestamp": datetime.utcnow(),
            "project_id": project_id
        })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model error: {str(e)}")

@api_router.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), project_id: int = None, current_user: User = Depends(get_current_user)):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    
    # Identify the text column
    col = next((c for c in ["text", "review", "comment", "content"] if c in df.columns), df.columns[0])
    
    # Identify the date column
    date_col = next((c for c in df.columns if any(k in c.lower() for k in ["date", "timestamp", "time"])), None)

    results = []
    log_entries = []
    summary = {"positive": 0, "negative": 0, "neutral": 0}
    
    # Process up to 1000 rows for analysis
    for i, row in df.head(1000).iterrows():
        text = str(row[col])
        timestamp = datetime.utcnow()
        
        if date_col:
            try:
                timestamp = pd.to_datetime(row[date_col])
                if pd.isna(timestamp):
                    timestamp = datetime.utcnow()
            except: pass
                
        try:
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text}, timeout=5)
            sentiment = res.json().get("sentiment", "neutral")
        except:
            sentiment = "neutral"
            
        summary[sentiment] += 1
        results.append({"text": text, "sentiment": sentiment, "timestamp": timestamp.isoformat()})
        log_entries.append({
            "text": text, 
            "sentiment": sentiment, 
            "user": current_user.username, 
            "timestamp": timestamp,
            "project_id": project_id
        })
        
    if log_entries:
        preds_log_col.insert_many(log_entries)
        
    return {
        "summary": summary,
        "total_processed": len(results),
        "results": results[:100] # Return only first 100 for UI performance
    }

# NEW: Universal Webhook Collector
@app.post("/api/collect/{project_id}")
async def collect_webhook(project_id: int, data: dict, db: Session = Depends(get_db)):
    # 1. Validate project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    text = data.get("text")
    source = data.get("source", "webhook_integration")
    
    if not text:
        raise HTTPException(status_code=400, detail="Missing 'text' field in JSON payload")

    # 2. Predict sentiment
    try:
        res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text}, timeout=5)
        sentiment = res.json().get("sentiment", "neutral")
    except:
        sentiment = "neutral"

    # 3. Log to MongoDB
    entry = {
        "text": text,
        "sentiment": sentiment,
        "source": source,
        "project_id": project_id,
        "user": "system_webhook",
        "timestamp": datetime.utcnow()
    }
    preds_log_col.insert_one(entry)

    return {
        "status": "success",
        "project": project.name,
        "sentiment": sentiment,
        "timestamp": entry["timestamp"].isoformat()
    }

# NEW: Connectors & Alerts Management
@api_router.get("/connectors")
def get_connectors(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    query = db.query(DataSource)
    if project_id: query = query.filter(DataSource.project_id == project_id)
    return query.all()

@api_router.post("/connectors")
def add_connector(platform: str, app_id: str, project_id: int, schedule: str = "daily", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    new_source = DataSource(platform=platform, app_id=app_id, schedule=schedule, project_id=project_id)
    db.add(new_source)
    db.commit()
    return {"message": "Connector added successfully"}

@api_router.delete("/connectors/{connector_id}")
def delete_connector(connector_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db.query(DataSource).filter(DataSource.id == connector_id).delete()
    db.commit()
    return {"message": "Connector removed"}

@api_router.get("/alerts")
def get_alert_rules(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    query = db.query(AlertRule)
    if project_id: query = query.filter(AlertRule.project_id == project_id)
    return query.all()

@api_router.post("/alerts")
def add_alert_rule(name: str, threshold: int, channel: str, destination: str, project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    new_rule = AlertRule(name=name, threshold=threshold, channel=channel, destination=destination, project_id=project_id)
    db.add(new_rule)
    db.commit()
    return {"message": "Alert rule created"}

@api_router.delete("/alerts/{rule_id}")
def delete_alert_rule(rule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    db.query(AlertRule).filter(AlertRule.id == rule_id).delete()
    db.commit()
    return {"message": "Alert rule removed"}

    # Include router at root and with /api prefix

app.include_router(api_router)
app.include_router(api_router, prefix="/api")
