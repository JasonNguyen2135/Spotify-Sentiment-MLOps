from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import pandas as pd
import requests
import os
import io

# ====== CONFIG ======
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:admin123@postgres:5432/mlops_auth")
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day

# ====== DATABASE SETUP ======
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="user") # "user" or "admin"

Base.metadata.create_all(bind=engine)

# ====== TỰ ĐỘNG TẠO ADMIN MẶC ĐỊNH ======
def create_default_admin():
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            print("🚀 Creating default admin user...")
            # Mật khẩu mặc định là admin123
            hashed_pwd = pwd_context.hash("admin123")
            new_admin = User(username="admin", hashed_password=hashed_pwd, role="admin")
            db.add(new_admin)
            db.commit()
            print("✅ Default admin created: admin / admin123")
        else:
            print("ℹ️ Admin user already exists.")
    except Exception as e:
        print(f"⚠️ Error creating default admin: {e}")
    finally:
        db.close()

create_default_admin()

# ====== SECURITY ======
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

from fastapi.middleware.cors import CORSMiddleware

# ====== APP ======
app = FastAPI(title="Spotify Backend API with Auth")

# ====== CẤU HÌNH CORS ======
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/register")
def register(username: str, password: str, role: str = "user", db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    new_user = User(username=username, hashed_password=get_password_hash(password), role=role)
    db.add(new_user)
    db.commit()
    return {"message": "User created successfully"}

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}

@app.get("/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role}

# ====== ML LOGIC ======
MODEL_API_URL = os.getenv("MODEL_API_URL", "http://model-service:8000")

@app.post("/analyze-csv")
async def analyze_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    # Bất kỳ user nào cũng có thể phân tích
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    col_name = "text" if "text" in df.columns else ("review" if "review" in df.columns else df.columns[0])
    
    results = []
    for index, row in df.iterrows():
        text = str(row[col_name])
        try:
            res = requests.post(f"{MODEL_API_URL}/predict", params={"review": text})
            sentiment = res.json().get("sentiment", "Error")
        except:
            sentiment = "Connection Error"
        results.append({"Câu bình luận": text, "Cảm xúc": sentiment})
        if index >= 9: break 

    return {"results": results}

@app.get("/admin/stats")
def get_admin_stats(current_user: User = Depends(get_current_user)):
    # Chỉ Admin mới được xem stats
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return {"total_users": 100, "system_health": "Good"}
