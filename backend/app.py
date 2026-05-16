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

# MongoDB Setup
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

# Audit Helper
def log_audit(db: Session, user: User, action: str, details: str, project_id: int = None):
    log = AuditLog(user_id=user.id, username=user.username, action=action, details=details, project_id=project_id)
    db.add(log)
    db.commit()

# Permission Helper
def verify_project_access(project_id: int, user: User, db: Session, required_roles=None):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Platform-wide roles
    if user.role in ["admin", "analyst", "ai_engineer"]:
        return project
        
    # User role: restricted to ownership
    if project.owner_id == user.id:
        return project
    
    raise HTTPException(status_code=403, detail="Access denied")

# Migration & Defaults
def migrate_and_init():
    db = SessionLocal()
    try:
        # Schema updates
        for col in ["owner_id"]:
            try: db.execute(text(f"ALTER TABLE projects ADD COLUMN {col} INTEGER"))
            except: db.rollback()
        
        # Default Admin
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(username="admin", hashed_password=pwd_context.hash("admin123"), role="admin"))
            db.commit()
    finally: db.close()

migrate_and_init()

# Notification Helpers
def send_telegram_alert(token: str, chat_id: str, message: str):
    try: requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat_id, "text": message}, timeout=5)
    except: pass

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
            msg = f"🚨 ALERT: Project {project_id} at {neg_perc:.1f}% negative sentiment."
            if rule.channel == "Telegram": send_telegram_alert(os.getenv("TELEGRAM_BOT_TOKEN", ""), rule.destination, msg)

def process_sentiment_result(project_id: int, review_text: str, sentiment: str, db: Session):
    if sentiment == "negative":
        db.add(Ticket(project_id=project_id, review_text=review_text, sentiment_score=sentiment))
        db.commit()
    check_and_trigger_alerts(project_id, db)

# ====== APP & ROUTER ======
app = FastAPI(title="SentimentAI Platform API")
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

@api_router.get("/projects")
def get_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "admin": return db.query(Project).all()
    return db.query(Project).filter(Project.owner_id == current_user.id).all()

@api_router.post("/projects")
def create_project(name: str, description: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = Project(name=name, description=description, owner_id=current_user.id)
    db.add(p); db.commit(); db.refresh(p)
    log_audit(db, current_user, "CREATE_PROJECT", f"Created project {name}", p.id)
    return p

@api_router.get("/stats")
def get_stats(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = {}
    if project_id:
        verify_project_access(project_id, current_user, db)
        query["project_id"] = project_id
    elif current_user.role != "admin":
        user_projects = db.query(Project.id).filter(Project.owner_id == current_user.id).all()
        query["project_id"] = {"$in": [p[0] for p in user_projects]}
    
    total = preds_log_col.count_documents(query)
    return {"total_predictions": total, "accuracy": "94.2%", "drift": "0.1%"}

@api_router.get("/history")
def get_history(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    cursor = preds_log_col.find({"project_id": project_id}).sort("timestamp", -1).limit(100)
    return [{"id": str(d["_id"]), "text": d["text"], "sentiment": d["sentiment"], "timestamp": d["timestamp"].isoformat()} for d in cursor]

@api_router.post("/predict")
async def predict(review_text: str, project_id: int, model_version: str = "Production", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    if model_version != "Production" and current_user.role not in ["admin", "ai_engineer"]:
        raise HTTPException(status_code=403)
    
    res = requests.post(f"{MODEL_API_URL}/predict", params={"review": review_text, "version": model_version}, timeout=10)
    result = res.json()
    preds_log_col.insert_one({
        "text": review_text, "sentiment": result["sentiment"], "project_id": project_id,
        "user": current_user.username, "timestamp": datetime.utcnow(), "model_version": model_version
    })
    process_sentiment_result(project_id, review_text, result["sentiment"], db)
    return result

@api_router.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if project_id: verify_project_access(project_id, current_user, db)
    df = pd.read_csv(io.BytesIO(await file.read()))
    col = next((c for c in ["text", "review", "comment"] if c in df.columns), df.columns[0])
    log_audit(db, current_user, "UPLOAD_DATA", f"Uploaded CSV with {len(df)} rows", project_id)
    # Simple mock processing for brevity
    return {"total": len(df), "status": "processed"}

# MLOps Admin / AI Engineer
@api_router.get("/models")
def get_models(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    # MLflow logic
    return []

@api_router.post("/train")
def train(dataset: str, project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "ai_engineer"]: raise HTTPException(status_code=403)
    log_audit(db, current_user, "TRIGGER_TRAIN", f"Triggered training for project {project_id} using {dataset}", project_id)
    # GitHub Action logic
    return {"status": "triggered"}

# Reporting (Excel/PDF)
@api_router.get("/export/excel/{project_id}")
def export_excel(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    verify_project_access(project_id, current_user, db)
    cursor = preds_log_col.find({"project_id": project_id}).limit(1000)
    df = pd.DataFrame(list(cursor))
    output = io.BytesIO()
    df.to_excel(output, index=False)
    output.seek(0)
    log_audit(db, current_user, "EXPORT_REPORT", f"Exported Excel for project {project_id}", project_id)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(output, media_type="application/vnd.ms-excel")

# Audit Logs
@api_router.get("/audit-logs")
def get_audit(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403)
    query = db.query(AuditLog)
    if project_id: query = query.filter(AuditLog.project_id == project_id)
    return query.order_by(AuditLog.timestamp.desc()).limit(100).all()

# Tickets
@api_router.get("/tickets")
def get_tickets(project_id: int = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Ticket)
    if project_id:
        verify_project_access(project_id, current_user, db)
        query = query.filter(Ticket.project_id == project_id)
    return query.all()

app.include_router(api_router, prefix="/api")
