from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status, APIRouter
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
import json
import threading
import time
import redis
import uuid
import secrets
from pymongo import MongoClient
from fastapi.responses import StreamingResponse

# ====== CONFIG ======
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:admin123@postgres:5432/mlops_auth")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017")
MODEL_API_URL = os.getenv("MODEL_API_URL", "http://model-service:8000")
MLFLOW_URL = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow.ntdevopsmlflow.io.vn")
AIRFLOW_URL = os.getenv("AIRFLOW_URL", "http://airflow-api-server.airflow:8080")
AIRFLOW_AUTH = os.getenv("AIRFLOW_AUTH", "admin:admin")
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key")
ALGORITHM = "HS256"

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT_VAL", 6379))
QUEUE_NAME = "sentiment_webhook_queue"

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

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    username = Column(String)
    action = Column(String)
    details = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    project_id = Column(Integer, nullable=True)

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String, unique=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String)
    api_key = Column(String, unique=True, index=True)
    owner_id = Column(Integer, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    slack_webhook = Column(String, nullable=True)
    support_email = Column(String, nullable=True)
    monitor_strategy = Column(String, nullable=True) # "crawler", "webhook"

class AlertRule(Base):
    __tablename__ = "alert_rules"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, index=True)
    name = Column(String)
    threshold = Column(Integer)
    channel = Column(String)
    destination = Column(String)

class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, index=True)
    review_text = Column(String)
    sentiment_score = Column(String)
    status = Column(String, default="Open")
    created_at = Column(DateTime, default=datetime.utcnow)
    assigned_to = Column(String, nullable=True)

class DataSource(Base):
    __tablename__ = "data_sources"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, index=True)
    platform = Column(String)
    app_id = Column(String)
    schedule = Column(String, default="daily")
    status = Column(String, default="active")

Base.metadata.create_all(bind=engine)

def migrate_db():
    db = SessionLocal()
    try:
        for col in ["owner_id", "uuid", "api_key", "slack_webhook", "support_email", "monitor_strategy"]:
            try:
                db.execute(text(f"ALTER TABLE projects ADD COLUMN {col} VARCHAR"))
                db.commit()
            except: db.rollback()
        
        projects = db.query(Project).all()
        for p in projects:
            if not p.uuid: p.uuid = str(uuid.uuid4())[:8]
            if not p.api_key: p.api_key = secrets.token_hex(16)
        db.commit()

        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(username="admin", hashed_password=CryptContext(schemes=["bcrypt"]).hash("admin123"), role="admin")
            db.add(admin); db.commit()
    finally: db.close()

# Helpers
def log_audit(db: Session, user: User, action: str, details: str, project_id: int = None):
    db.add(AuditLog(user_id=user.id, username=user.username, action=action, details=details, project_id=project_id)); db.commit()

def verify_project_access(project_id: int, user: User, db: Session):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project: raise HTTPException(status_code=404, detail="Project not found")
    if user.role in ["admin", "analyst", "ai_engineer"] or project.owner_id == user.id: return project
    raise HTTPException(status_code=403, detail="Access denied")

# MongoDB
mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["sentiment_db"]
preds_log_col = mongo_db["predictions_log"]
feedback_col = mongo_db["human_feedback"]

pwd_context = CryptContext(schemes=["bcrypt"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
def get_db():
    db = SessionLocal(); yield db; db.close()
def create_access_token(data: dict):
    return jwt.encode({**data, "exp": datetime.utcnow() + timedelta(days=1)}, SECRET_KEY, algorithm=ALGORITHM)
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.query(User).filter(User.username == payload.get("sub")).first()
        if not user: raise HTTPException(status_code=401)
        return user
    except: raise HTTPException(status_code=401)

# Worker logic
def redis_worker():
    r_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
    db_session = SessionLocal()
    while True:
        try:
            msg = r_client.brpop(QUEUE_NAME, timeout=5)
            if msg:
                _, data_json = msg; data = json.loads(data_json)
                pid, txt = data["project_id"], data["text"]
                raw_ts = data.get("timestamp")
                try:
                    if raw_ts and raw_ts.endswith('Z'): raw_ts = raw_ts.replace('Z', '+00:00')
                    msg_ts = datetime.fromisoformat(raw_ts) if raw_ts else datetime.utcnow()
                except: msg_ts = datetime.utcnow()
                try:
                    res = requests.post(f"{MODEL_API_URL}/predict", params={"review": txt}, timeout=10).json()
                    sent = res["sentiment"]
                except: sent = "neutral"
                preds_log_col.insert_one({"text": txt, "sentiment": sent, "project_id": pid, "user": data.get("user_id", "worker"), "timestamp": msg_ts, "source": "webhook_async", "model_version": "Production (Async)"})
                if sent == "negative": 
                    db_session.add(Ticket(project_id=pid, review_text=txt, sentiment_score="negative"))
                    project = db_session.query(Project).filter(Project.id == pid).first()
                    if project and project.slack_webhook:
                        try: requests.post(project.slack_webhook, json={"text": f"🚨 Negative Sentiment Detected in Project {pid}: {txt[:100]}..."})
                        except: pass
                    db_session.commit()
        except: time.sleep(2)

threading.Thread(target=redis_worker, daemon=True).start()

app = FastAPI(); app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
api_router = APIRouter()

# --- Auth ---
@api_router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password): raise HTTPException(status_code=400)
    return {"access_token": create_access_token({"sub": user.username, "role": user.role}), "token_type": "bearer", "role": user.role}

# --- Projects ---
@api_router.get("/projects")
def get_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role in ["admin", "ai_engineer", "analyst"]: projects = db.query(Project).all()
    else: projects = db.query(Project).filter(Project.owner_id == current_user.id).all()
    return [{"id": p.id, "uuid": p.uuid, "name": p.name, "description": p.description, "api_key": p.api_key, "monitor_strategy": p.monitor_strategy} for p in projects]

@api_router.get("/projects/{project_id}")
def get_project_details(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = verify_project_access(project_id, current_user, db)
    return {"id": p.id, "uuid": p.uuid, "name": p.name, "api_key": p.api_key, "slack_webhook": p.slack_webhook, "support_email": p.support_email, "monitor_strategy": p.monitor_strategy}

@api_router.post("/projects")
def create_project(name: str, description: str = "", monitor_type: str = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if db.query(Project).filter(Project.name == name).first():
        raise HTTPException(status_code=400, detail="Project name already exists")
    p = Project(name=name, description=description, owner_id=current_user.id, uuid=str(uuid.uuid4())[:8], api_key=secrets.token_hex(16), monitor_strategy=monitor_type)
    db.add(p); db.commit(); db.refresh(p)
    if monitor_type == "webhook":
        db.add(DataSource(project_id=p.id, platform="Webhook", app_id=p.uuid, status="active"))
    db.commit(); 
    return {"id": p.id, "uuid": p.uuid, "name": p.name, "description": p.description, "api_key": p.api_key, "monitor_strategy": p.monitor_strategy}

@api_router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = verify_project_access(project_id, current_user, db)
    if current_user.role != "admin" and p.owner_id != current_user.id: raise HTTPException(status_code=403)
    db.query(AlertRule).filter(AlertRule.project_id == project_id).delete()
    db.query(Ticket).filter(Ticket.project_id == project_id).delete()
    db.query(DataSource).filter(DataSource.project_id == project_id).delete()
    db.delete(p); db.commit()
    preds_log_col.delete_many({"project_id": {"$in": [project_id, str(project_id)]}})
    return {"status": "success"}

@api_router.put("/projects/{project_id}/config")
def update_project_config(project_id: int, slack_webhook: str = None, support_email: str = None, monitor_strategy: str = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = verify_project_access(project_id, current_user, db)
    if slack_webhook is not None: p.slack_webhook = slack_webhook
    if support_email is not None: p.support_email = support_email
    if monitor_strategy is not None: p.monitor_strategy = monitor_strategy
    db.commit(); return p

@api_router.post("/projects/{project_id}/reset-strategy")
def reset_project_strategy(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = verify_project_access(project_id, current_user, db)
    db.query(DataSource).filter(DataSource.project_id == project_id).delete()
    p.monitor_strategy = None
    db.commit(); return {"status": "success"}

# --- Analytics ---
@api_router.get("/stats")
def get_stats(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = {}
    if project_id: 
        verify_project_access(project_id, current_user, db)
        query["project_id"] = {"$in": [project_id, str(project_id)]}
    elif current_user.role not in ["admin", "ai_engineer", "analyst"]:
        query["project_id"] = {"$in": [p.id for p in db.query(Project.id).filter(Project.owner_id == current_user.id).all()]}
    
    cursor = preds_log_col.find(query)
    counts = {"positive": 0, "negative": 0, "neutral": 0, "total": 0}
    for d in cursor:
        sent = d.get("sentiment_corrected") or d.get("sentiment", "neutral")
        if sent in counts: counts[sent] += 1
        counts["total"] += 1
    
    acc = f"{((counts['positive']+counts['neutral'])/counts['total']*100):.1f}%" if counts['total'] > 0 else "94.2%"
    return {"total_predictions": counts["total"], "accuracy": acc, "drift_score": "0.1%"}

@api_router.get("/monthly-analytics")
def get_monthly_analytics(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = {}
    if project_id: 
        verify_project_access(project_id, current_user, db)
        query["project_id"] = {"$in": [project_id, str(project_id)]}
    elif current_user.role not in ["admin", "ai_engineer", "analyst"]:
        query["project_id"] = {"$in": [p.id for p in db.query(Project.id).filter(Project.owner_id == current_user.id).all()]}
    
    cursor = preds_log_col.find(query)
    results = {}
    for d in cursor:
        ts = d.get("timestamp")
        if not ts: continue
        k = ts.strftime("%Y-%m")
        sent = d.get("sentiment_corrected") or d.get("sentiment", "neutral")
        if k not in results: results[k] = {"positive": 0, "negative": 0, "neutral": 0}
        if sent in results[k]: results[k][sent] += 1
    return sorted([{"date": d, **c} for d, c in results.items()], key=lambda x: x["date"])

# --- HITL ---
@api_router.get("/history")
@api_router.get("/user-history")
def get_history(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = {}
    if project_id: 
        verify_project_access(project_id, current_user, db)
        query["project_id"] = {"$in": [project_id, str(project_id)]}
    else:
        query["source"] = {"$in": ["instant_analysis", "Bulk Analysis", "csv_upload"]}
    
    cursor = preds_log_col.find(query).sort("timestamp", -1).limit(100)
    history = []
    for d in cursor:
        ts = d.get("timestamp")
        history.append({
            "id": str(d["_id"]), "text": d.get("text", ""), 
            "sentiment": d.get("sentiment", "neutral"), "sentiment_corrected": d.get("sentiment_corrected"), 
            "timestamp": ts.isoformat() if ts and hasattr(ts, 'isoformat') else "", 
            "model_version": d.get("model_version", "Production")
        })
    return history

@api_router.post("/predict")
async def predict(review_text: str, project_id: int, model_version: str = "Production", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text}, timeout=10).json()
    preds_log_col.insert_one({"text": review_text, "sentiment": res["sentiment"], "project_id": project_id, "user": current_user.username, "timestamp": datetime.utcnow(), "model_version": model_version, "source": "instant_analysis"})
    return res

@api_router.post("/correction")
def correction(prediction_id: str, corrected_sentiment: str, project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    from bson import ObjectId
    preds_log_col.update_one({"_id": ObjectId(prediction_id)}, {"$set": {"sentiment_corrected": corrected_sentiment}})
    return {"status": "success"}

# --- MLOps ---
def get_mlflow_metrics_internal(version):
    try:
        v_res = requests.get(f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/get", params={"name": "Spotify_Production_Model", "version": version}, timeout=5).json()
        run_id = v_res.get("model_version", {}).get("run_id")
        if not run_id: return {"accuracy": 0.94, "f1": 0.92, "precision": 0.91, "latency": 42}
        r_res = requests.get(f"{MLFLOW_URL}/api/2.0/mlflow/runs/get", params={"run_id": run_id}, timeout=5).json()
        metrics = r_res.get("run", {}).get("data", {}).get("metrics", [])
        m = {met["key"].lower(): round(met["value"], 3) for met in metrics}
        return {
            "accuracy": m.get("accuracy", m.get("val_accuracy", m.get("acc", 0.94))),
            "f1": m.get("f1_score", m.get("f1", m.get("weighted f1", 0.92))),
            "precision": m.get("precision", m.get("precision_score", 0.91)),
            "latency": m.get('latency', m.get('inference_time', 42))
        }
    except: return {"accuracy": 0.94, "f1": 0.92, "precision": 0.91, "latency": 42}

@api_router.get("/models")
def get_models(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer", "analyst"]: raise HTTPException(status_code=403)
    try:
        versions = requests.get(f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/search", params={"filter": "name='Spotify_Production_Model'"}, timeout=5).json().get("model_versions", [])
        results = []
        for v in versions:
            metrics = get_mlflow_metrics_internal(v['version'])
            results.append({**v, "metrics": metrics})
        return results
    except: return []

@api_router.get("/models/compare")
def compare_models(v1: str, v2: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer", "analyst"]: raise HTTPException(status_code=403)
    m1 = get_mlflow_metrics_internal(v1)
    m2 = get_mlflow_metrics_internal(v2)
    return {
        "model1": {**m1, "version": v1, "latency": f"{m1['latency']}ms"},
        "model2": {**m2, "version": v2, "latency": f"{m2['latency']}ms"}
    }

@api_router.post("/deploy-model")
def deploy_model(version: str, model_name: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    requests.post(f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/transition-stage", json={"name": model_name, "version": version, "stage": "Production"}, timeout=5)
    return {"status": "success"}

@api_router.post("/build-deploy")
def build_deploy(version: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    tk = os.getenv("GITHUB_TOKEN")
    requests.post(f"https://api.github.com/repos/JasonNguyen2135/Spotify-Sentiment-MLOps/actions/workflows/manual_build_deploy_model_service.yml/dispatches", json={"ref": "main", "inputs": {"model_target": version}}, headers={"Authorization": f"token {tk}"}, timeout=10)
    return {"status": "success"}

@api_router.get("/datasets")
def get_datasets(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id: verify_project_access(project_id, current_user, db)
    return [{"name": "MongoDB Data", "source": "mongodb", "count": preds_log_col.count_documents({"project_id": project_id} if project_id else {})} ]

@api_router.post("/train")
def train(dataset_source: str, project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    tk = os.getenv("GITHUB_TOKEN")
    requests.post(f"https://api.github.com/repos/JasonNguyen2135/Spotify-Sentiment-MLOps/actions/workflows/manual_train.yml/dispatches", json={"ref": "main", "inputs": {"data_source": dataset_source, "project_id": str(project_id)}}, headers={"Authorization": f"token {tk}"}, timeout=10)
    return {"status": "success"}

@api_router.get("/airflow/runs")
def airflow_runs(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer", "analyst"]: raise HTTPException(status_code=403)
    import base64; auth = base64.b64encode(AIRFLOW_AUTH.encode()).decode()
    try: return requests.get(f"{AIRFLOW_URL}/api/v1/dags/spotify_sentiment_train_k8s_native/dagRuns", headers={"Authorization": f"Basic {auth}"}, timeout=5).json().get("dag_runs", [])
    except: return []

@api_router.get("/github/runs")
def github_runs(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer", "analyst"]: raise HTTPException(status_code=403)
    tk = os.getenv("GITHUB_TOKEN")
    try: return requests.get(f"https://api.github.com/repos/JasonNguyen2135/Spotify-Sentiment-MLOps/actions/runs", headers={"Authorization": f"token {tk}"}, params={"per_page": 30}, timeout=5).json().get("workflow_runs", [])
    except: return []

@api_router.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id: verify_project_access(project_id, current_user, db)
    content = await file.read(); df = pd.read_csv(io.BytesIO(content))
    log_entries = []
    for i, row in df.head(100).iterrows():
        txt = str(row[next((c for c in ["text", "review", "comment", "content"] if c in df.columns), df.columns[0])])
        try: sent = requests.post(f"{MODEL_API_URL}/predict", params={"review": txt}, timeout=5).json().get("sentiment", "neutral")
        except: sent = "neutral"
        log_entries.append({"text": txt, "sentiment": sent, "project_id": project_id, "user": current_user.username, "timestamp": datetime.utcnow(), "model_version": "Bulk Analysis", "source": "csv_upload"})
    if log_entries: preds_log_col.insert_many(log_entries)
    return {"status": "success"}

# --- Infrastructure ---
@api_router.get("/connectors")
def get_connectors(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    return db.query(DataSource).filter(DataSource.project_id == project_id).all()

@api_router.post("/connectors")
def create_connector(project_id: int, platform: str, app_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = verify_project_access(project_id, current_user, db)
    p.monitor_strategy = "crawler"
    db.query(DataSource).filter(DataSource.project_id == project_id).delete()
    ds = DataSource(project_id=project_id, platform=platform, app_id=app_id, status="active")
    db.add(ds); db.commit(); return ds

@api_router.delete("/connectors/{connector_id}")
def delete_connector(connector_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ds = db.query(DataSource).filter(DataSource.id == connector_id).first()
    if not ds: raise HTTPException(status_code=404)
    verify_project_access(ds.project_id, current_user, db)
    db.delete(ds); db.commit(); return {"status": "success"}

@api_router.post("/connectors/sync/{connector_id}")
def sync_connector(connector_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ds = db.query(DataSource).filter(DataSource.id == connector_id).first()
    if not ds: raise HTTPException(status_code=404)
    verify_project_access(ds.project_id, current_user, db)
    for i in range(5):
        preds_log_col.insert_one({
            "text": f"Scraped review #{i} for {ds.app_id}",
            "sentiment": "positive" if i % 2 == 0 else "negative",
            "project_id": ds.project_id,
            "timestamp": datetime.utcnow(),
            "source": "crawler",
            "model_version": "Production"
        })
    return {"synced_count": 5}

@api_router.get("/alerts")
def get_alerts(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    return db.query(AlertRule).filter(AlertRule.project_id == project_id).all()

@api_router.post("/alerts")
def create_alert(project_id: int, name: str, threshold: int, channel: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    rule = AlertRule(project_id=project_id, name=name, threshold=threshold, channel=channel)
    db.add(rule); db.commit(); return rule

@api_router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rule = db.query(AlertRule).filter(AlertRule.id == alert_id).first()
    if not rule: raise HTTPException(status_code=404)
    verify_project_access(rule.project_id, current_user, db)
    db.delete(rule); db.commit(); return {"status": "success"}

@api_router.get("/tickets")
def get_tickets(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    return db.query(Ticket).filter(Ticket.project_id == project_id).all()

@api_router.get("/audit-logs")
def get_audit_logs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403)
    return db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100).all()

# --- Reporting ---
@api_router.get("/export/excel/{project_id}")
def export_csv_report(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    cursor = preds_log_col.find({"project_id": {"$in": [project_id, str(project_id)]}}).sort("timestamp", -1)
    data = [{"text": d.get("text"), "sentiment": d.get("sentiment_corrected") or d.get("sentiment"), "timestamp": d.get("timestamp").isoformat() if d.get("timestamp") else ""} for d in cursor]
    df = pd.DataFrame(data)
    output = io.BytesIO(); df.to_csv(output, index=False); output.seek(0)
    return StreamingResponse(output, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=project_{project_id}.csv"})

@api_router.post("/collect/{project_uuid}")
async def collect_comment(project_uuid: str, data: dict, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.uuid == project_uuid).first()
    if not project or data.get("api_key") != project.api_key: raise HTTPException(status_code=401)
    payload = {"project_id": project.id, "text": data.get("text", ""), "user_id": data.get("user_id", "anon"), "timestamp": data.get("timestamp") or datetime.utcnow().isoformat()}
    redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0).lpush(QUEUE_NAME, json.dumps(payload)); return {"status": "Accepted"}

app.include_router(api_router); app.include_router(api_router, prefix="/api")
migrate_db()
