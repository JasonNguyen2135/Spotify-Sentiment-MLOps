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
from pymongo import MongoClient

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
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
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
    role = Column(String, default="user") # admin, user, analyst, ai_engineer

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
    name = Column(String, unique=True, index=True)
    description = Column(String)
    owner_id = Column(Integer, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class DataSource(Base):
    __tablename__ = "data_sources"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, index=True)
    platform = Column(String)
    app_id = Column(String)
    schedule = Column(String, default="daily")
    status = Column(String, default="active")

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

Base.metadata.create_all(bind=engine)

def migrate_db():
    db = SessionLocal()
    try:
        for table, col in [("projects", "owner_id"), ("data_sources", "project_id"), ("alert_rules", "project_id")]:
            try: db.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER")); db.commit()
            except: db.rollback()
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(username="admin", hashed_password=CryptContext(schemes=["bcrypt"]).hash("admin123"), role="admin")
            db.add(admin); db.commit(); db.refresh(admin)
        if not db.query(Project).first():
            p = Project(name="Default Workspace", description="Auto-created.", owner_id=admin.id)
            db.add(p); db.commit(); db.refresh(p)
            db.query(DataSource).update({DataSource.project_id: p.id}); db.query(AlertRule).update({AlertRule.project_id: p.id}); db.commit()
    finally: db.close()

# Helpers
def log_audit(db: Session, user: User, action: str, details: str, project_id: int = None):
    db.add(AuditLog(user_id=user.id, username=user.username, action=action, details=details, project_id=project_id)); db.commit()

def verify_project_access(project_id: int, user: User, db: Session):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project: raise HTTPException(status_code=404)
    if user.role in ["admin", "analyst", "ai_engineer"] or project.owner_id == user.id: return project
    raise HTTPException(status_code=403)

# MongoDB
mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["sentiment_db"]
preds_log_col = mongo_db["predictions_log"]
feedback_col = mongo_db["human_feedback"]
reviews_col = mongo_db["raw_reviews"]

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
    """
    Background worker to consume messages from Redis and process them.
    """
    print("Starting MQ Consumer Worker...")
    r_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
    db_session = SessionLocal()
    
    while True:
        try:
            # Block until a message is available (timeout 5s)
            msg = r_client.brpop(QUEUE_NAME, timeout=5)
            if msg:
                _, data_json = msg
                data = json.loads(data_json)
                
                project_id = data["project_id"]
                text_val = data["text"]
                username = data.get("user_id", "system_worker")
                
                # Predict
                try:
                    res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text_val}, timeout=10).json()
                    sentiment = res["sentiment"]
                except:
                    sentiment = "neutral"
                
                # Log to Mongo
                preds_log_col.insert_one({
                    "text": text_val, 
                    "sentiment": sentiment, 
                    "project_id": project_id,
                    "user": username, 
                    "timestamp": datetime.utcnow(),
                    "source": data.get("source", "webhook_async")
                })
                
                # Create ticket if negative
                if sentiment == "negative":
                    db_add = Ticket(project_id=project_id, review_text=text_val, sentiment_score="negative")
                    db_session.add(db_add)
                    db_session.commit()
                
                print(f"Worker: Processed async comment for project {project_id}")
                
        except Exception as e:
            print(f"Worker Error: {e}")
            time.sleep(2)

# Start worker in a separate thread
worker_thread = threading.Thread(target=redis_worker, daemon=True)
worker_thread.start()

app = FastAPI(); app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
api_router = APIRouter()

# --- Auth ---
@api_router.post("/register")
def register(username: str, password: str, role: str = "user", db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == username).first(): raise HTTPException(status_code=400)
    db.add(User(username=username, hashed_password=pwd_context.hash(password), role=role)); db.commit(); return {"message": "Success"}

@api_router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password): raise HTTPException(status_code=400)
    return {"access_token": create_access_token({"sub": user.username, "role": user.role}), "token_type": "bearer", "role": user.role}

# --- Projects ---
@api_router.get("/projects")
def get_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role in ["admin", "ai_engineer", "analyst"]: return db.query(Project).all()
    return db.query(Project).filter(Project.owner_id == current_user.id).all()

@api_router.post("/projects")
def create_project(name: str, description: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = Project(name=name, description=description, owner_id=current_user.id)
    db.add(p); db.commit(); db.refresh(p); log_audit(db, current_user, "CREATE_PROJECT", f"Created {name}", p.id); return p

# --- Analytics ---
@api_router.get("/stats")
def get_stats(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = {}
    if project_id: verify_project_access(project_id, current_user, db); query["project_id"] = project_id
    elif current_user.role not in ["admin", "ai_engineer", "analyst"]: query["project_id"] = {"$in": [p.id for p in db.query(Project.id).filter(Project.owner_id == current_user.id).all()]}
    return {"total_predictions": preds_log_col.count_documents(query), "accuracy": "94.2%", "drift_score": "0.1%"}

@api_router.get("/monthly-analytics")
def get_monthly_analytics(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = {}
    if project_id: verify_project_access(project_id, current_user, db); query["project_id"] = project_id
    elif current_user.role not in ["admin", "ai_engineer", "analyst"]: query["project_id"] = {"$in": [p.id for p in db.query(Project.id).filter(Project.owner_id == current_user.id).all()]}
    pipeline = [{"$match": query}, {"$group": {"_id": {"month": {"$month": "$timestamp"}, "year": {"$year": "$timestamp"}, "sentiment": "$sentiment"}, "count": {"$sum": 1}}}]
    results = {}
    for doc in preds_log_col.aggregate(pipeline):
        _id = doc.get('_id', {})
        year, month, sentiment = _id.get('year', 2024), _id.get('month', 1), _id.get('sentiment', 'neutral')
        k = f"{year}-{month:02d}"
        if k not in results: results[k] = {"positive": 0, "negative": 0, "neutral": 0}
        if sentiment in results[k]: results[k][sentiment] = doc.get("count", 0)
    return sorted([{"date": d, **c} for d, c in results.items()], key=lambda x: x["date"])

@api_router.get("/comparison")
def get_comparison(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id: verify_project_access(project_id, current_user, db)
    curr = {"positive": 150, "negative": 45, "neutral": 80, "total": 275}
    prev = {"positive": 120, "negative": 60, "neutral": 70, "total": 250}
    total_growth = ((curr["total"] - prev["total"]) / prev["total"] * 100) if prev["total"] > 0 else 0
    return {"current": curr, "previous": prev, "total_growth": total_growth, "delta_positive": curr["positive"] - prev["positive"], "delta_negative": curr["negative"] - prev["negative"]}

@api_router.get("/word-cloud")
def get_word_cloud(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id: verify_project_access(project_id, current_user, db)
    return [{"text": "demo", "value": 10}]

# --- History & HITL ---
@api_router.get("/history")
@api_router.get("/user-history")
def get_history(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = {}
    if project_id: verify_project_access(project_id, current_user, db); query["project_id"] = project_id
    elif current_user.role not in ["admin", "ai_engineer", "analyst"]: query["project_id"] = {"$in": [p.id for p in db.query(Project.id).filter(Project.owner_id == current_user.id).all()]}
    cursor = preds_log_col.find(query).sort("timestamp", -1).limit(50)
    history = []
    for d in cursor:
        ts = d.get("timestamp")
        history.append({
            "id": str(d["_id"]), "text": d.get("text", ""), "sentiment": d.get("sentiment", "neutral"),
            "timestamp": ts.isoformat() if ts and hasattr(ts, 'isoformat') else datetime.utcnow().isoformat()
        })
    return history

@api_router.post("/predict")
async def predict(review_text: str, project_id: int, model_version: str = "Production", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    if model_version != "Production" and current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text, "version": model_version}, timeout=10).json()
    preds_log_col.insert_one({"text": review_text, "sentiment": res["sentiment"], "project_id": project_id, "user": current_user.username, "timestamp": datetime.utcnow(), "model_version": model_version})
    if res["sentiment"] == "negative": db.add(Ticket(project_id=project_id, review_text=review_text, sentiment_score="negative")); db.commit()
    return res

@api_router.post("/correction")
def correction(prediction_id: str, text: str, corrected_sentiment: str, project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    feedback_col.insert_one({"text": text, "corrected_sentiment": corrected_sentiment, "user": current_user.username, "timestamp": datetime.utcnow(), "original_id": prediction_id, "project_id": project_id})
    from bson import ObjectId
    try: preds_log_col.update_one({"_id": ObjectId(prediction_id)}, {"$set": {"sentiment_corrected": corrected_sentiment}})
    except: pass
    return {"status": "success"}

@api_router.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id: verify_project_access(project_id, current_user, db)
    df = pd.read_csv(io.BytesIO(await file.read()))
    col = next((c for c in ["text", "review", "comment", "content"] if c in df.columns), df.columns[0])
    summary = {"positive": 0, "negative": 0, "neutral": 0}
    results = []
    for i, row in df.head(100).iterrows():
        txt = str(row[col])
        try:
            sent = requests.post(f"{MODEL_API_URL}/predict", params={"review": txt}, timeout=5).json().get("sentiment", "neutral")
        except: sent = "neutral"
        summary[sent] += 1; results.append({"text": txt, "sentiment": sent})
    log_audit(db, current_user, "UPLOAD_DATA", f"Analyzed {len(results)} rows", project_id)
    return {"summary": summary, "results": results, "total": len(df), "status": "processed"}

# --- MLOps ---
@api_router.get("/models")
def get_models(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer", "analyst"]: raise HTTPException(status_code=403)
    try: return requests.get(f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/search", params={"filter": "name='Spotify_Production_Model'"}, timeout=5).json().get("model_versions", [])
    except: return []

@api_router.get("/datasets")
def get_datasets(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id: verify_project_access(project_id, current_user, db)
    return [{"name": "MongoDB Data", "source": "mongodb", "count": preds_log_col.count_documents({"project_id": project_id} if project_id else {})}]

@api_router.post("/train")
def train(dataset: str, project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    tk = os.getenv("GITHUB_TOKEN")
    if not tk: return {"status": "error"}
    url = f"https://api.github.com/repos/JasonNguyen2135/Spotify-Sentiment-MLOps/actions/workflows/manual_train.yml/dispatches"
    requests.post(url, json={"ref": "main", "inputs": {"data_source": dataset, "project_id": str(project_id)}}, headers={"Authorization": f"token {tk}"}, timeout=10)
    log_audit(db, current_user, "TRIGGER_TRAIN", f"Training {dataset}", project_id); return {"status": "success"}

@api_router.get("/airflow/runs")
def airflow_runs(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    import base64; auth = base64.b64encode(AIRFLOW_AUTH.encode()).decode()
    try: return requests.get(f"{AIRFLOW_URL}/api/v1/dags/spotify_sentiment_train_k8s_native/dagRuns", headers={"Authorization": f"Basic {auth}"}, timeout=5).json().get("dag_runs", [])
    except: return []

@api_router.get("/github/runs")
def github_runs(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    tk = os.getenv("GITHUB_TOKEN")
    if not tk: return []
    try: return requests.get(f"https://api.github.com/repos/JasonNguyen2135/Spotify-Sentiment-MLOps/actions/runs", headers={"Authorization": f"token {tk}"}, params={"per_page": 5}, timeout=5).json().get("workflow_runs", [])
    except: return []

# --- System ---
@api_router.get("/connectors")
def get_connectors(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(DataSource)
    if project_id: verify_project_access(project_id, current_user, db); q = q.filter(DataSource.project_id == project_id)
    return q.all()

@api_router.get("/alerts")
def get_alerts(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(AlertRule)
    if project_id: verify_project_access(project_id, current_user, db); q = q.filter(AlertRule.project_id == project_id)
    return q.all()

@api_router.get("/tickets")
def get_tickets(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Ticket)
    if project_id: verify_project_access(project_id, current_user, db); q = q.filter(Ticket.project_id == project_id)
    return q.all()

@api_router.get("/audit-logs")
def get_audit_logs(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer", "analyst"]: raise HTTPException(status_code=403)
    q = db.query(AuditLog)
    if project_id: q = q.filter(AuditLog.project_id == project_id)
    return q.order_by(AuditLog.timestamp.desc()).limit(100).all()

# --- Reporting ---
from fastapi.responses import StreamingResponse, Response
@api_router.get("/export/excel/{project_id}")
def export_excel(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    df = pd.DataFrame(list(preds_log_col.find({"project_id": project_id}).limit(1000)))
    if not df.empty: df['_id'] = df['_id'].astype(str)
    else: df = pd.DataFrame(columns=["text", "sentiment", "timestamp"])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer: df.to_excel(writer, index=False)
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=report_{project_id}.xlsx"})

@api_router.get("/export/pdf/{project_id}")
def export_pdf(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    return Response(content=b"PDF Placeholder", media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=report_{project_id}.pdf"})

app.include_router(api_router); app.include_router(api_router, prefix="/api")
migrate_db()
