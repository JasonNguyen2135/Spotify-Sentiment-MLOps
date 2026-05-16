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
    channel = Column(String) # Telegram, Email, Slack
    destination = Column(String) # Chat ID or Email

class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, index=True)
    review_text = Column(String)
    sentiment_score = Column(String)
    status = Column(String, default="Open") # Open, In Progress, Resolved
    created_at = Column(DateTime, default=datetime.utcnow)
    assigned_to = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

def migrate_db():
    db = SessionLocal()
    try:
        # Handle Schema Changes
        try: db.execute(text("ALTER TABLE projects ADD COLUMN owner_id INTEGER")); db.commit()
        except: db.rollback()
        
        try: db.execute(text("ALTER TABLE data_sources ADD COLUMN project_id INTEGER")); db.commit()
        except: db.rollback()

        try: db.execute(text("ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_app_id_key")); db.commit()
        except: db.rollback()
        
        try: db.execute(text("ALTER TABLE alert_rules ADD COLUMN project_id INTEGER")); db.commit()
        except: db.rollback()

        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(username="admin", hashed_password=pwd_context.hash("admin123"), role="admin")
            db.add(admin); db.commit(); db.refresh(admin)

        if not db.query(Project).first():
            default_project = Project(name="Default Workspace", description="Auto-created workspace.", owner_id=admin.id)
            db.add(default_project); db.commit(); db.refresh(default_project)
            db.query(DataSource).update({DataSource.project_id: default_project.id})
            db.query(AlertRule).update({AlertRule.project_id: default_project.id})
            db.commit()
    finally:
        db.close()

# Notification Helpers
def send_telegram_alert(token: str, chat_id: str, message: str):
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        requests.post(url, json={"chat_id": chat_id, "text": message}, timeout=5)
    except Exception as e: print(f"Telegram error: {e}")

def check_and_trigger_alerts(project_id: int, db: Session):
    rules = db.query(AlertRule).filter(AlertRule.project_id == project_id).all()
    if not rules: return
    cursor = preds_log_col.find({"project_id": project_id}).sort("timestamp", -1).limit(50)
    recent = list(cursor)
    if not recent: return
    neg_count = sum(1 for r in recent if r.get("sentiment") == "negative")
    neg_perc = (neg_count / len(recent)) * 100
    for rule in rules:
        if neg_perc >= rule.threshold:
            msg = f"🚨 SMART ALERT: Project '{project_id}' detected {neg_perc:.1f}% negative sentiment."
            if rule.channel == "Telegram":
                send_telegram_alert(os.getenv("TELEGRAM_BOT_TOKEN", ""), rule.destination, msg)

def process_sentiment_result(project_id: int, review_text: str, sentiment: str, db: Session):
    if sentiment == "negative":
        db.add(Ticket(project_id=project_id, review_text=review_text, sentiment_score=sentiment))
        db.commit()
    check_and_trigger_alerts(project_id, db)

# Audit Helper
def log_audit(db: Session, user: User, action: str, details: str, project_id: int = None):
    log = AuditLog(user_id=user.id, username=user.username, action=action, details=details, project_id=project_id)
    db.add(log); db.commit()

# MongoDB
mongo_client = MongoClient(MONGO_URL)
mongo_db = mongo_client["sentiment_db"]
reviews_col = mongo_db["raw_reviews"]
preds_log_col = mongo_db["predictions_log"]
feedback_col = mongo_db["human_feedback"]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
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

def verify_project_access(project_id: int, user: User, db: Session):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project: raise HTTPException(status_code=404)
    if user.role in ["admin", "analyst", "ai_engineer"]: return project
    if project.owner_id == user.id: return project
    raise HTTPException(status_code=403, detail="Access denied")

app = FastAPI(title="SentimentAI Orchestrator API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
api_router = APIRouter()

@api_router.post("/register")
def register(username: str, password: str, role: str = "user", db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == username).first(): raise HTTPException(status_code=400)
    db.add(User(username=username, hashed_password=pwd_context.hash(password), role=role))
    db.commit()
    return {"message": "Success"}

@api_router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password): raise HTTPException(status_code=400)
    return {"access_token": create_access_token(data={"sub": user.username, "role": user.role}), "token_type": "bearer", "role": user.role}

@api_router.get("/stats")
def get_stats(project_id: int = None, monitor_only: bool = True, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = {}
    if project_id:
        verify_project_access(project_id, current_user, db)
        query["project_id"] = project_id
    elif current_user.role != 'admin':
        user_projects = db.query(Project.id).filter(Project.owner_id == current_user.id).all()
        query["project_id"] = {"$in": [p[0] for p in user_projects]}
    
    if monitor_only:
        query["source"] = {"$in": ["auto_crawl_Google Play", "manual_sync_Google Play", "webhook_integration", "system_webhook"]}

    try: total_preds = preds_log_col.count_documents(query)
    except: total_preds = 0
    return {"total_predictions": total_preds, "accuracy": "94.2%", "drift_score": "0.1%"}

@api_router.get("/projects")
def get_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role in ["admin", "ai_engineer", "analyst"]: return db.query(Project).all()
    return db.query(Project).filter(Project.owner_id == current_user.id).all()

@api_router.post("/projects")
def create_project(name: str, description: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = Project(name=name, description=description, owner_id=current_user.id)
    db.add(project); db.commit(); db.refresh(project)
    log_audit(db, current_user, "CREATE_PROJECT", f"Project {name} created", project.id)
    return project

@api_router.post("/predict")
async def predict_single(review_text: str, project_id: int, model_version: str = "Production", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    if model_version != "Production" and current_user.role not in ["admin", "ai_engineer"]:
        raise HTTPException(status_code=403, detail="Unauthorized model version")
    
    try:
        res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text, "version": model_version}, timeout=10)
        result = res.json()
        sentiment = result.get("sentiment")
        preds_log_col.insert_one({
            "text": review_text, "sentiment": sentiment, "user": current_user.username,
            "timestamp": datetime.utcnow(), "project_id": project_id, "model_version": model_version
        })
        process_sentiment_result(project_id, review_text, sentiment, db)
        return result
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/history")
def get_history(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    cursor = preds_log_col.find({"project_id": project_id}).sort("timestamp", -1).limit(100)
    history = []
    for doc in cursor:
        history.append({
            "id": str(doc["_id"]), "text": doc.get("text"), "sentiment": doc.get("sentiment"),
            "sentiment_corrected": doc.get("sentiment_corrected"), "timestamp": doc.get("timestamp").isoformat(),
            "model_version": doc.get("model_version", "Production")
        })
    return history

@api_router.post("/correction")
def submit_correction(prediction_id: str, text: str, corrected_sentiment: str, project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    feedback_col.insert_one({
        "text": text, "corrected_sentiment": corrected_sentiment, "user": current_user.username,
        "timestamp": datetime.utcnow(), "original_id": prediction_id, "project_id": project_id
    })
    from bson import ObjectId
    try: preds_log_col.update_one({"_id": ObjectId(prediction_id)}, {"$set": {"sentiment_corrected": corrected_sentiment}})
    except: pass
    log_audit(db, current_user, "CORRECT_SENTIMENT", f"Corrected {prediction_id} to {corrected_sentiment}", project_id)
    return {"status": "success"}

@api_router.get("/models")
def get_models(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    try:
        res = requests.get(f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/search", params={"filter": "name='Spotify_Production_Model'"}, timeout=5)
        return res.json().get("model_versions", []) if res.status_code == 200 else []
    except: return []

@api_router.post("/train")
def trigger_training(dataset_source: str, project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
    if not GITHUB_TOKEN: return {"status": "error", "message": "No GITHUB_TOKEN"}
    url = f"https://api.github.com/repos/JasonNguyen2135/Spotify-Sentiment-MLOps/actions/workflows/manual_train.yml/dispatches"
    res = requests.post(url, json={"ref": "main", "inputs": {"data_source": dataset_source, "project_id": str(project_id)}}, headers={"Authorization": f"token {GITHUB_TOKEN}"}, timeout=10)
    log_audit(db, current_user, "TRIGGER_TRAIN", f"Triggered training with {dataset_source}", project_id)
    return {"status": "success" if res.status_code == 204 else "error"}

@api_router.get("/monthly-analytics")
def get_monthly_analytics(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    pipeline = [{"$match": {"project_id": project_id}}, {"$group": {"_id": {"month": {"$month": "$timestamp"}, "year": {"$year": "$timestamp"}, "sentiment": "$sentiment"}, "count": {"$sum": 1}}}]
    cursor = preds_log_col.aggregate(pipeline)
    results = {}
    for doc in cursor:
        k = f"{doc['_id']['year']}-{doc['_id']['month']:02d}"
        if k not in results: results[k] = {"positive": 0, "negative": 0, "neutral": 0}
        results[k][doc['_id']['sentiment']] = doc["count"]
    return sorted([{"date": d, **c} for d, c in results.items()], key=lambda x: x["date"])

@api_router.get("/comparison")
def get_comparison(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    # Simple mock comparison logic
    return {"current": {"positive": 10, "negative": 5, "total": 15}, "previous": {"positive": 8, "negative": 2, "total": 10}}

@api_router.get("/word-cloud")
def get_word_cloud(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    return [{"text": "demo", "value": 10}, {"text": "quality", "value": 15}]

@api_router.get("/export/excel/{project_id}")
def export_excel(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    cursor = preds_log_col.find({"project_id": project_id}).limit(1000)
    df = pd.DataFrame(list(cursor))
    if '_id' in df.columns: df['_id'] = df['_id'].astype(str)
    output = io.BytesIO()
    df.to_excel(output, index=False)
    output.seek(0)
    log_audit(db, current_user, "EXPORT_EXCEL", "Exported Excel report", project_id)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(output, media_type="application/vnd.ms-excel", headers={"Content-Disposition": f"attachment; filename=report_{project_id}.xlsx"})

@api_router.get("/audit-logs")
def get_audit_logs(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403)
    query = db.query(AuditLog)
    if project_id: query = query.filter(AuditLog.project_id == project_id)
    return query.order_by(AuditLog.timestamp.desc()).limit(100).all()

@api_router.get("/tickets")
def get_tickets(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Ticket)
    if project_id:
        verify_project_access(project_id, current_user, db)
        query = query.filter(Ticket.project_id == project_id)
    return query.all()

app.include_router(api_router, prefix="/api")
migrate_db()
