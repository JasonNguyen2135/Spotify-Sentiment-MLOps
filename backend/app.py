from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import Column, Integer, String, create_engine, func, DateTime, text
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
MLFLOW_URL = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
AIRFLOW_URL = os.getenv("AIRFLOW_URL", "http://airflow-api-server.airflow:8080")
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
    owner_id = Column(Integer, index=True) # Added for user isolation
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
        # 0. Handle Schema Changes (Manually add columns if they don't exist)
        try:
            db.execute(text("ALTER TABLE projects ADD COLUMN owner_id INTEGER"))
            db.commit()
        except: db.rollback()
        
        try:
            db.execute(text("ALTER TABLE data_sources ADD COLUMN project_id INTEGER"))
            db.commit()
        except: db.rollback()

        # Drop old unique constraint on app_id to allow same app in multiple projects
        try:
            db.execute(text("ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_app_id_key"))
            db.commit()
        except: db.rollback()
        
        try:
            db.execute(text("ALTER TABLE alert_rules ADD COLUMN project_id INTEGER"))
            db.commit()
        except: db.rollback()

        # 1. Ensure default admin exists
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(username="admin", hashed_password=pwd_context.hash("admin123"), role="admin")
            db.add(admin)
            db.commit()
            db.refresh(admin)

        if not db.query(Project).first():
            default_project = Project(
                name="Default Workspace", 
                description="Automatically created workspace for existing data.",
                owner_id=admin.id
            )
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
        else:
            # Fix existing projects with no owner (if any)
            db.query(Project).filter(Project.owner_id == None).update({Project.owner_id: admin.id})
            db.commit()
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

def verify_project_owner(project_id: int, user_id: int, db: Session):
    project = db.query(Project).filter(Project.id == project_id, Project.owner_id == user_id).first()
    if not project:
        raise HTTPException(status_code=403, detail="Access denied to this project")
    return project

@api_router.get("/stats")
def get_stats(project_id: int = None, monitor_only: bool = True, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_count = db.query(func.count(User.id)).scalar()
    
    if project_id is None:
        return {"model_version": "N/A", "total_predictions": 0, "dataset_size": "0 records", "active_users": user_count, "accuracy": "N/A", "drift_score": "0%"}

    verify_project_owner(project_id, current_user.id, db)

    query = {"project_id": project_id}
    if monitor_only:
        # Filter for data from crawlers, webhooks, or manual syncs (excluding bulk csv)
        query["source"] = {"$in": ["auto_crawl_Google Play", "manual_sync_Google Play", "webhook_integration", "system_webhook"]}

    accuracy = "N/A"
    model_version = "v1.2.0-Prod"
    # ... rest of get_stats
    accuracy = "N/A"
    model_version = "v1.2.0-Prod"
    dataset_size = None
    try:
        meta_res = requests.get(f"{MODEL_API_URL}/metadata", params={"project_id": project_id}, timeout=2)
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

# NEW: Project Management
@api_router.get("/projects")
def get_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Only return projects owned by the current user
    return db.query(Project).filter(Project.owner_id == current_user.id).all()

@api_router.post("/projects")
def create_project(name: str, description: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if db.query(Project).filter(Project.name == name, Project.owner_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="Project name exists for this user")
    project = Project(name=name, description=description, owner_id=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

# NEW: Dataset Management
@api_router.get("/datasets")
def get_datasets(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id is None: return []
    verify_project_owner(project_id, current_user.id, db)
    
    query = {"project_id": project_id}
    mongo_count = 0
    try:
        mongo_count = reviews_col.count_documents(query)
    except: pass

    return [
        {
            "name": f"Current Project Data (MongoDB)", 
            "source": "mongodb", 
            "count": mongo_count,
            "description": "Latest data crawled or uploaded for this project."
        },
        {
            "name": "Enterprise Baseline v1.0", 
            "source": "https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/spotify_db.raw_reviews.csv", 
            "count": 12500,
            "description": "Standard dataset for baseline model training."
        }
    ]

# NEW: Model Management (MLflow Proxy)
@api_router.get("/models")
def get_models(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id is None: return []
    verify_project_owner(project_id, current_user.id, db)
    try:
        # Model name patterns to search
        model_names_to_search = [
            f"Sentiment_Analysis_Model_{project_id}",
            "Sentiment_Analysis_Model",
            "Spotify_Production_Model",
            "Spotify_Sentiment_Model",
            "Sentiment_Analysis_Model_default"
        ]
        
        all_versions = []
        for model_name in model_names_to_search:
            try:
                res = requests.get(
                    f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/search",
                    params={"filter": f"name='{model_name}'"},
                    timeout=5
                )
                if res.status_code == 200:
                    versions = res.json().get("model_versions", [])
                    for v in versions:
                        v['mlflow_url'] = f"{MLFLOW_URL}/#/models/{model_name}/versions/{v['version']}"
                        # Mark if it's project-specific
                        v['is_project_specific'] = (model_name == f"Sentiment_Analysis_Model_{project_id}")
                    all_versions.extend(versions)
            except Exception as e:
                print(f"Error finding model {model_name}: {e}")
        
        # Sort: Project specific first, then by version descending
        return sorted(all_versions, key=lambda x: (x.get('is_project_specific', False), int(x['version'])), reverse=True)
    except Exception as e:
        print(f"MLflow search error: {e}")
        return []

@api_router.post("/deploy-model")
def deploy_model(version: str, model_name: str = None, project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id is None: raise HTTPException(status_code=400, detail="project_id required")
    verify_project_owner(project_id, current_user.id, db)
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        # If model_name is not provided, default to project-specific name
        if not model_name:
            model_name = f"Sentiment_Analysis_Model_{project_id}"
            
        payload = {
            "name": model_name,
            "version": version,
            "stage": "Production",
            "archive_existing_versions": True
        }
        res = requests.post(f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/transition-stage", json=payload, timeout=5)
        if res.status_code != 200:
            raise Exception(f"MLflow error: {res.text}")
            
        return {
            "status": "success", 
            "message": f"Model {model_name} v{version} promoted to Production",
            "model_name": model_name,
            "version": version
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/build-deploy")
def trigger_build_deploy(version: str, model_name: str = None, project_id: int = None, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Trigger GitHub Action via Workflow Dispatch
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
    if not GITHUB_TOKEN:
        return {"status": "warning", "message": "Backend GITHUB_TOKEN not configured."}

    owner = "JasonNguyen2135"
    repo = "Spotify-Sentiment-MLOps"
    workflow_id = "manual_build_deploy_model_service.yml"
    
    url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    # Use provided model_name or project-specific default
    payload = {
        "ref": "main",
        "inputs": {
            "model_target": version,
            "model_name": model_name or f"Sentiment_Analysis_Model_{project_id}"
        }
    }
    
    try:
        res = requests.post(url, json=payload, headers=headers, timeout=10)
        if res.status_code == 204:
            return {"status": "success", "message": f"Triggered CI/CD for {model_name or 'project model'} version {version}"}
        else:
            return {"status": "error", "message": f"GitHub API error: {res.text}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# NEW: Training Orchestration (Airflow Proxy)
@api_router.get("/airflow/runs")
def get_airflow_runs(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        import base64
        auth_header = base64.b64encode(AIRFLOW_AUTH.encode('ascii')).decode('ascii')
        # Reverted to /api/v1 for Airflow 2 compatibility
        url = f"{AIRFLOW_URL}/api/v1/dags/spotify_sentiment_train_k8s_native/dagRuns"
        print(f"DEBUG: Fetching Airflow runs from {url}")
        res = requests.get(
            url,
            params={"limit": 10, "order_by": "-execution_date"},
            headers={"Authorization": f"Basic {auth_header}"},
            timeout=5
        )
        if res.status_code == 200:
            return res.json().get("dag_runs", [])
        else:
            print(f"DEBUG: Airflow Error {res.status_code}: {res.text}")
        return []
    except Exception as e:
        print(f"Airflow connection error: {e}")
        return []

@api_router.post("/train")
def trigger_training(dataset_source: str, project_id: int = None, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
    if not GITHUB_TOKEN:
        print("DEBUG: GITHUB_TOKEN is missing in environment variables")
        return {"status": "warning", "message": "Backend GITHUB_TOKEN not configured."}

    owner = "JasonNguyen2135"
    repo = "Spotify-Sentiment-MLOps"
    workflow_id = "manual_train.yml"
    
    url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    payload = {
        "ref": "main",
        "inputs": {
            "data_source": dataset_source,
            "project_id": str(project_id) if project_id else "default"
        }
    }
    
    print(f"DEBUG: Triggering GitHub Action: {url}")
    print(f"DEBUG: Payload: {payload}")
    
    try:
        res = requests.post(url, json=payload, headers=headers, timeout=10)
        print(f"DEBUG: GitHub API Response Code: {res.status_code}")
        print(f"DEBUG: GitHub API Response Body: {res.text}")
        
        if res.status_code == 204:
            return {"status": "success", "message": f"Triggered GitHub Action to train model with data: {dataset_source}"}
        else:
            return {"status": "error", "message": f"GitHub API error: {res.text}"}
    except Exception as e:
        print(f"DEBUG: Exception during GitHub Trigger: {str(e)}")
        return {"status": "error", "message": str(e)}

@api_router.get("/airflow/logs/{dag_run_id}")
def get_airflow_logs(dag_run_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        import base64
        auth_header = base64.b64encode(AIRFLOW_AUTH.encode('ascii')).decode('ascii')
        
        # Task ID is hardcoded based on the DAG definition
        task_id = "model_training_pipeline"
        # 1. Get task instances to find the try_number (Updated to /api/v1)
        ti_res = requests.get(
            f"{AIRFLOW_URL}/api/v1/dags/spotify_sentiment_train_k8s_native/dagRuns/{dag_run_id}/taskInstances/{task_id}",
            headers={"Authorization": f"Basic {auth_header}"},
            timeout=5
        )
        if ti_res.status_code != 200:
            print(f"DEBUG: Airflow TI Error {ti_res.status_code}: {ti_res.text}")
            return {"logs": "Task instance not found or still queued..."}
        
        try_number = ti_res.json().get("try_number", 1)
        
        # 2. Fetch logs (Updated to /api/v1)
        log_res = requests.get(
            f"{AIRFLOW_URL}/api/v1/dags/spotify_sentiment_train_k8s_native/dagRuns/{dag_run_id}/taskInstances/{task_id}/logs/{try_number}",
            headers={"Authorization": f"Basic {auth_header}"},
            timeout=10
        )
        return {"logs": log_res.text}
    except Exception as e:
        print(f"DEBUG: Airflow Log Fetch Error: {str(e)}")
        return {"logs": f"Error fetching logs: {str(e)}"}


@api_router.get("/user-history")
def get_user_history(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id is None: return []
    verify_project_owner(project_id, current_user.id, db)
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
def get_monthly_analytics(project_id: int = None, monitor_only: bool = True, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id is None: return []
    verify_project_owner(project_id, current_user.id, db)
    match_query = {"project_id": project_id}
    if monitor_only:
        match_query["source"] = {"$in": ["auto_crawl_Google Play", "manual_sync_Google Play", "webhook_integration", "system_webhook"]}
    
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
def get_comparison(project_id: int = None, monitor_only: bool = True, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id is None: return None
    verify_project_owner(project_id, current_user.id, db)
    now = datetime.utcnow()
    this_month_start = datetime(now.year, now.month, 1)
    last_month_end = this_month_start - timedelta(days=1)
    last_month_start = datetime(last_month_end.year, last_month_end.month, 1)

    def get_counts(start, end):
        match_query = {"timestamp": {"$gte": start, "$lte": end}, "project_id": project_id}
        if monitor_only:
            match_query["source"] = {"$in": ["auto_crawl_Google Play", "manual_sync_Google Play", "webhook_integration", "system_webhook"]}
        
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
def get_word_cloud(sentiment: str = None, project_id: int = None, monitor_only: bool = True, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id is None: return []
    verify_project_owner(project_id, current_user.id, db)
    query = {"project_id": project_id}
    if sentiment: query["sentiment"] = sentiment
    if monitor_only:
        query["source"] = {"$in": ["auto_crawl_Google Play", "manual_sync_Google Play", "webhook_integration", "system_webhook"]}
    
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
def submit_correction(prediction_id: str = None, text: str = None, corrected_sentiment: str = None, project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id is None: raise HTTPException(status_code=400, detail="project_id required")
    verify_project_owner(project_id, current_user.id, db)
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
async def predict_single(review_text: str, project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # If project_id is provided, verify ownership and log it
    if project_id is not None:
        verify_project_owner(project_id, current_user.id, db)
    
    try:
        res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text, "project_id": project_id}, timeout=10)
        result = res.json()
        
        # Only log to DB if project context exists
        if project_id is not None:
            preds_log_col.insert_one({
                "text": review_text, "sentiment": result.get("sentiment"),
                "user": current_user.username, "timestamp": datetime.utcnow(),
                "project_id": project_id
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model error: {str(e)}")

@api_router.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Ownership check only if saving to a project
    if project_id is not None:
        verify_project_owner(project_id, current_user.id, db)
        
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
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text, "project_id": project_id}, timeout=5)
            sentiment = res.json().get("sentiment", "neutral")
        except:
            sentiment = "neutral"
            
        summary[sentiment] += 1
        results.append({"text": text, "sentiment": sentiment, "timestamp": timestamp.isoformat()})
        
        if project_id is not None:
            log_entries.append({
                "text": text, 
                "sentiment": sentiment, 
                "user": current_user.username, 
                "timestamp": timestamp,
                "project_id": project_id
            })
        
    if log_entries and project_id is not None:
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
        res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text, "project_id": project_id}, timeout=5)
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
    # Feature now available to regular users for their own projects
    query = db.query(DataSource)
    if project_id:
        verify_project_owner(project_id, current_user.id, db)
        query = query.filter(DataSource.project_id == project_id)
    return query.all()

@api_router.post("/connectors")
def add_connector(platform: str, app_id: str, project_id: int, schedule: str = "daily", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_owner(project_id, current_user.id, db)

    # Enforce one app per project rule: Delete old app data if exists
    existing = db.query(DataSource).filter(DataSource.project_id == project_id).first()
    if existing:
        preds_log_col.delete_many({"project_id": project_id})
        reviews_col.delete_many({"project_id": project_id})
        db.delete(existing)
        db.commit()

    new_source = DataSource(platform=platform, app_id=app_id, schedule=schedule, project_id=project_id)
    db.add(new_source)
    db.commit()
    return {"message": "Connector updated. Project data has been reset for the new application."}

from google_play_scraper import Sort, reviews as fetch_reviews

@api_router.post("/connectors/sync/{connector_id}")
async def sync_connector(connector_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    source = db.query(DataSource).filter(DataSource.id == connector_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    verify_project_owner(source.project_id, current_user.id, db)
    # ... rest of sync logic

    try:
        if source.platform == 'Google Play':
            # Fetch last 100 reviews for quick sync
            result, _ = fetch_reviews(source.app_id, lang='en', country='us', sort=Sort.NEWEST, count=100)
            
            batch = []
            for item in result:
                text_content = str(item['content'])
                
                # Predict sentiment
                try:
                    res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text_content, "project_id": source.project_id}, timeout=5)
                    sentiment = res.json().get("sentiment", "neutral")
                except:
                    sentiment = "neutral"

                batch.append({
                    "text": text_content,
                    "sentiment": sentiment,
                    "source": f"manual_sync_{source.platform}",
                    "project_id": source.project_id,
                    "user": "system_sync",
                    "timestamp": item['at'] or datetime.utcnow()
                })
            
            if batch:
                preds_log_col.insert_many(batch)
            
            return {"status": "success", "synced_count": len(batch)}
        else:
            return {"status": "error", "message": f"Platform {source.platform} not supported for sync"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/connectors/{connector_id}")
def delete_connector(connector_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    source = db.query(DataSource).filter(DataSource.id == connector_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Connector not found")
    verify_project_owner(source.project_id, current_user.id, db)
    db.delete(source)
    db.commit()
    return {"message": "Connector removed"}

@api_router.get("/alerts")
def get_alert_rules(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(AlertRule)
    if project_id:
        verify_project_owner(project_id, current_user.id, db)
        query = query.filter(AlertRule.project_id == project_id)
    return query.all()

@api_router.post("/alerts")
def add_alert_rule(name: str, threshold: int, channel: str, destination: str, project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_owner(project_id, current_user.id, db)
    new_rule = AlertRule(name=name, threshold=threshold, channel=channel, destination=destination, project_id=project_id)
    db.add(new_rule)
    db.commit()
    return {"message": "Alert rule created"}

@api_router.delete("/alerts/{rule_id}")
def delete_alert_rule(rule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    verify_project_owner(rule.project_id, current_user.id, db)
    db.delete(rule)
    db.commit()
    return {"message": "Alert rule removed"}

@api_router.get("/github/runs")
def get_github_runs(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
    if not GITHUB_TOKEN:
        return []

    owner = "JasonNguyen2135"
    repo = "Spotify-Sentiment-MLOps"
    
    # Fetch runs for both relevant workflows
    workflows = ["manual_train.yml", "manual_build_deploy_model_service.yml"]
    all_runs = []
    
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    for wf in workflows:
        try:
            url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{wf}/runs"
            res = requests.get(url, headers=headers, params={"per_page": 5}, timeout=5)
            if res.status_code == 200:
                runs = res.json().get("workflow_runs", [])
                for r in runs:
                    # Enrich run data with workflow name for the UI
                    r['workflow_filename'] = wf
                    all_runs.append(r)
        except Exception as e:
            print(f"Error fetching GitHub runs for {wf}: {e}")
            
    # Sort by creation date descending
    return sorted(all_runs, key=lambda x: x['created_at'], reverse=True)

# Include router at root and with /api prefix

app.include_router(api_router)
app.include_router(api_router, prefix="/api")
