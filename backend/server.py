from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Response, Header
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import io
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import secrets
import hashlib
import hmac
import json
import aiofiles
import aiofiles.os
from jose import JWTError, jwt
from passlib.context import CryptContext
import httpx
try:
    from supabase_store import create_document_store
except ImportError:  # pragma: no cover
    from backend.supabase_store import create_document_store

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _env_csv(name: str, default: str) -> List[str]:
    raw = os.environ.get(name, default)
    values = [item.strip() for item in raw.split(",")]
    return [item for item in values if item]


# Supabase document store (DB by default, REST fallback optional)
supabase_db_url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
supabase_storage_bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "secure-pdfs")
supabase_force_rest = _env_flag("SUPABASE_FORCE_REST", False)
supabase_auto_pooler = _env_flag("SUPABASE_AUTO_DISCOVER_POOLER", True)
supabase_pooler_timeout = _env_float("SUPABASE_POOLER_DISCOVERY_TIMEOUT", 2.0)
supabase_pooler_regions_raw = os.environ.get("SUPABASE_POOLER_REGIONS", "")
supabase_pooler_regions = [region.strip() for region in supabase_pooler_regions_raw.split(",") if region.strip()] or None
db = create_document_store(
    database_url=supabase_db_url,
    supabase_url=supabase_url,
    service_role_key=supabase_service_role_key,
    storage_bucket=supabase_storage_bucket,
    force_rest=supabase_force_rest,
    auto_discover_pooler=supabase_auto_pooler,
    pooler_discovery_timeout=supabase_pooler_timeout,
    pooler_regions=supabase_pooler_regions,
)

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# PDF Storage
PDF_STORAGE_PATH = Path(os.environ.get('PDF_STORAGE_PATH', str(ROOT_DIR / 'storage' / 'pdfs')))
PDF_STORAGE_PATH.mkdir(parents=True, exist_ok=True)

# Stripe Configuration
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')

# Subscription Plans
SUBSCRIPTION_PLANS = {
    "basic": {"price": 5.00, "name": "Basic", "storage_mb": 500, "links_per_month": 50},
    "pro": {"price": 15.00, "name": "Pro", "storage_mb": 2000, "links_per_month": 200},
    "enterprise": {"price": 49.00, "name": "Enterprise", "storage_mb": 10000, "links_per_month": 1000}
}

# Create the main app
app = FastAPI(title="Autodestroy PDF Platform")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    language: Optional[str] = "en"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    name: str
    email: str
    role: str
    subscription_status: str
    plan: str
    storage_used: int
    language: Optional[str] = "en"
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class PDFUploadResponse(BaseModel):
    pdf_id: str
    filename: str
    file_size: int
    folder: Optional[str] = None
    created_at: datetime

class PDFResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    pdf_id: str
    user_id: str
    filename: str
    original_filename: Optional[str] = None
    file_size: int
    folder: Optional[str] = None
    created_at: datetime

class PDFRename(BaseModel):
    filename: str

class PDFMove(BaseModel):
    folder: Optional[str] = None

class FolderCreate(BaseModel):
    name: str

class LinkCreate(BaseModel):
    pdf_id: str
    expiry_mode: str  # "countdown", "fixed", "manual"
    expiry_days: Optional[int] = 0
    expiry_hours: Optional[int] = 0
    expiry_minutes: Optional[int] = 0
    expiry_seconds: Optional[int] = 0
    expiry_fixed_datetime: Optional[datetime] = None
    custom_expired_url: Optional[str] = None
    custom_expired_message: Optional[str] = None

class LinkResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    link_id: str
    pdf_id: str
    user_id: str
    token: str
    expiry_mode: str
    expiry_duration_seconds: Optional[int] = None
    expiry_fixed_datetime: Optional[datetime] = None
    first_open_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    open_count: int
    unique_ips: List[str]
    status: str
    custom_expired_url: Optional[str] = None
    custom_expired_message: Optional[str] = None
    created_at: datetime
    full_url: Optional[str] = None

class LinkAccessResponse(BaseModel):
    status: str
    pdf_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    remaining_seconds: Optional[int] = None
    watermark_data: Optional[Dict[str, Any]] = None
    custom_expired_url: Optional[str] = None
    custom_expired_message: Optional[str] = None
    viewer_id: Optional[str] = None

class SubscriptionCreate(BaseModel):
    plan: str
    origin_url: str

class StripeConfigUpdate(BaseModel):
    stripe_key: Optional[str] = None
    mode: Optional[str] = None  # "sandbox" or "live"

class DomainCreate(BaseModel):
    domain: str

class AdminUserUpdate(BaseModel):
    subscription_status: Optional[str] = None
    plan: Optional[str] = None
    role: Optional[str] = None

class PasswordReset(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class LanguageUpdate(BaseModel):
    language: str

# ==================== AUTH HELPERS ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def _stripe_key_type(api_key: str) -> str:
    if not api_key:
        return "none"
    if api_key.startswith("sk_live_"):
        return "live"
    if api_key.startswith("sk_test_"):
        return "sandbox"
    return "unknown"

def _stripe_key_preview(api_key: str) -> str:
    if not api_key:
        return "Not configured"
    return f"sk_...{api_key[-4:]}"

async def _get_active_stripe_config() -> Dict[str, Any]:
    doc = await db.platform_settings.find_one({"key": "stripe"}, {"_id": 0})
    live_key = (doc or {}).get("live_key", "") or ""
    sandbox_key = (doc or {}).get("sandbox_key", "") or ""
    legacy_key = (doc or {}).get("stripe_key", "") or ""
    env_key = STRIPE_API_KEY or ""

    env_type = _stripe_key_type(env_key)
    legacy_type = _stripe_key_type(legacy_key)

    # Backward compatibility with old single-key storage.
    if not live_key and legacy_type == "live":
        live_key = legacy_key
    if not sandbox_key and legacy_type == "sandbox":
        sandbox_key = legacy_key

    mode = (doc or {}).get("mode")
    if mode not in ["sandbox", "live"]:
        mode = "live" if env_type == "live" else "sandbox"

    if mode == "live":
        active_key = live_key or (env_key if env_type == "live" else "")
    else:
        active_key = sandbox_key or (env_key if env_type == "sandbox" else "")

    active_type = _stripe_key_type(active_key)

    return {
        "mode": mode,
        "active_key": active_key,
        "active_key_type": active_type,
        "has_live_key": bool(live_key) or env_type == "live",
        "has_sandbox_key": bool(sandbox_key) or env_type == "sandbox",
        "sandbox_active": mode == "sandbox",
        "key_preview": _stripe_key_preview(active_key),
    }

async def _stripe_api_request(method: str, path: str, api_key: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not api_key:
        raise HTTPException(status_code=400, detail="Stripe key is not configured")

    url = f"https://api.stripe.com{path}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.request(
                method=method,
                url=url,
                data=data,
                headers={"Authorization": f"Bearer {api_key}"}
            )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Unable to reach Stripe API")

    if response.status_code >= 400:
        detail = "Stripe API request failed"
        try:
            payload = response.json()
            detail = payload.get("error", {}).get("message") or detail
        except Exception:
            if response.text:
                detail = response.text
        raise HTTPException(status_code=400, detail=f"Stripe error: {detail}")

    return response.json()

def _verify_stripe_signature(payload: bytes, signature_header: Optional[str], webhook_secret: str) -> bool:
    if not signature_header or not webhook_secret:
        return False

    sig_parts: Dict[str, List[str]] = {}
    for item in signature_header.split(","):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        sig_parts.setdefault(key, []).append(value)

    timestamp = (sig_parts.get("t") or [None])[0]
    signatures = sig_parts.get("v1") or []
    if not timestamp or not signatures:
        return False

    signed_payload = f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    expected = hmac.new(webhook_secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()

    return any(hmac.compare_digest(expected, sig) for sig in signatures)

def _normalize_client_ip(ip_value: Optional[str]) -> str:
    if not ip_value:
        return "unknown"
    ip_value = ip_value.strip()
    if ip_value in ["::1", "0:0:0:0:0:0:0:1"]:
        return "127.0.0.1"
    if ip_value.startswith("::ffff:"):
        return ip_value.split("::ffff:", 1)[1]
    return ip_value

def _get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return _normalize_client_ip(xff.split(",")[0])

    xri = request.headers.get("x-real-ip")
    if xri:
        return _normalize_client_ip(xri)

    return _normalize_client_ip(request.client.host if request.client else "unknown")

def _ip_session_key(client_ip: str) -> str:
    # Use a stable, Mongo-safe key instead of raw IP (IPv4 contains '.').
    return hashlib.sha256(client_ip.encode("utf-8")).hexdigest()[:24]

async def get_current_user(request: Request) -> dict:
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    
    # Check cookie first
    token = request.cookies.get("session_token")
    
    # Then check Authorization header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        raise credentials_exception
    
    # Check if it's a session token (from Google OAuth)
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if not user:
            raise credentials_exception
        return user
    
    # Try JWT token
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if user is None:
        raise credentials_exception
    
    return user

async def get_current_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except:
        return None

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    user_doc = {
        "user_id": user_id,
        "name": user_data.name,
        "email": user_data.email,
        "password_hash": get_password_hash(user_data.password),
        "role": "user",
        "subscription_status": "inactive",
        "plan": "none",
        "storage_used": 0,
        "language": user_data.language or "en",
        "created_at": now.isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    access_token = create_access_token(data={"sub": user_id})
    user_doc.pop("password_hash", None)
    user_doc["created_at"] = now
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(**user_doc)
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin, response: Response):
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if not user or not verify_password(user_data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = create_access_token(data={"sub": user["user_id"]})
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60*60*24*7,
        path="/"
    )
    
    user.pop("password_hash", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(**user)
    )

@api_router.post("/auth/google/session")
async def google_auth_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID required")
    
    # Exchange session_id with Emergent Auth
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        google_data = resp.json()
    
    email = google_data.get("email")
    name = google_data.get("name")
    picture = google_data.get("picture")
    session_token = google_data.get("session_token")
    
    # Find or create user
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        user_doc = {
            "user_id": user_id,
            "name": name,
            "email": email,
            "picture": picture,
            "role": "user",
            "subscription_status": "inactive",
            "plan": "none",
            "storage_used": 0,
            "language": "en",
            "created_at": now.isoformat()
        }
        await db.users.insert_one(user_doc)
    
    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60*60*24*7,
        path="/"
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user.pop("password_hash", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return {"user": UserResponse(**user)}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(request: Request):
    user = await get_current_user(request)
    user.pop("password_hash", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return UserResponse(**user)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.put("/auth/language")
async def update_language(data: LanguageUpdate, request: Request):
    user = await get_current_user(request)
    
    # Validate language code
    valid_languages = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar', 'hi', 'tr', 'pl', 'sv', 'no', 'da', 'fi', 'el', 'cs', 'ro', 'hu', 'th', 'vi', 'id', 'ms', 'fil', 'uk', 'he', 'sl']
    if data.language not in valid_languages:
        raise HTTPException(status_code=400, detail="Invalid language code")
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"language": data.language}}
    )
    
    return {"message": "Language updated successfully", "language": data.language}

@api_router.post("/auth/password-reset")
async def request_password_reset(data: PasswordReset):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        # Don't reveal if email exists
        return {"message": "If email exists, reset link will be sent"}
    
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    await db.password_resets.insert_one({
        "user_id": user["user_id"],
        "token": reset_token,
        "expires_at": expires_at.isoformat(),
        "used": False
    })
    
    # In production, send email with reset link
    logger.info(f"Password reset token for {data.email}: {reset_token}")
    
    return {"message": "If email exists, reset link will be sent", "token": reset_token}

@api_router.post("/auth/password-reset/confirm")
async def confirm_password_reset(data: PasswordResetConfirm):
    reset = await db.password_resets.find_one({"token": data.token, "used": False}, {"_id": 0})
    if not reset:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    expires_at = datetime.fromisoformat(reset["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token expired")
    
    new_hash = get_password_hash(data.new_password)
    await db.users.update_one(
        {"user_id": reset["user_id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    await db.password_resets.update_one(
        {"token": data.token},
        {"$set": {"used": True}}
    )
    
    return {"message": "Password reset successfully"}

# ==================== FOLDER ENDPOINTS ====================

@api_router.get("/folders")
async def get_folders(request: Request):
    user = await get_current_user(request)
    folders = await db.folders.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    return folders

@api_router.post("/folders")
async def create_folder(folder_data: FolderCreate, request: Request):
    user = await get_current_user(request)
    
    folder_id = f"folder_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    folder_doc = {
        "folder_id": folder_id,
        "user_id": user["user_id"],
        "name": folder_data.name,
        "created_at": now.isoformat()
    }
    
    await db.folders.insert_one(folder_doc)
    folder_doc["created_at"] = now
    return folder_doc

@api_router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, request: Request):
    user = await get_current_user(request)
    
    # Move PDFs in folder to root
    await db.pdfs.update_many(
        {"user_id": user["user_id"], "folder": folder_id},
        {"$set": {"folder": None}}
    )
    
    result = await db.folders.delete_one({"folder_id": folder_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    return {"message": "Folder deleted successfully"}

# ==================== PDF ENDPOINTS ====================

@api_router.post("/pdfs/upload", response_model=PDFUploadResponse)
async def upload_pdf(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    
    # Check subscription
    if user.get("subscription_status") != "active":
        raise HTTPException(status_code=403, detail="Active subscription required")
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Read file
    content = await file.read()
    file_size = len(content)
    
    # Check storage limit
    plan = user.get("plan", "basic")
    plan_info = SUBSCRIPTION_PLANS.get(plan, SUBSCRIPTION_PLANS["basic"])
    max_storage = plan_info["storage_mb"] * 1024 * 1024
    
    if user.get("storage_used", 0) + file_size > max_storage:
        raise HTTPException(status_code=400, detail="Storage limit exceeded")
    
    # Generate unique filename
    pdf_id = f"pdf_{uuid.uuid4().hex[:12]}"
    safe_filename = f"{pdf_id}_{secrets.token_hex(8)}.pdf"
    storage_key = f"{user['user_id']}/{safe_filename}"
    await db.put_file(storage_key, user["user_id"], content, "application/pdf")
    
    now = datetime.now(timezone.utc)
    
    # Save to database
    pdf_doc = {
        "pdf_id": pdf_id,
        "user_id": user["user_id"],
        "filename": file.filename,
        "original_filename": file.filename,
        "storage_key": storage_key,
        "file_path": None,  # legacy compatibility for old records
        "file_size": file_size,
        "folder": None,
        "created_at": now.isoformat()
    }
    await db.pdfs.insert_one(pdf_doc)
    
    # Update user storage
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"storage_used": file_size}}
    )
    
    return PDFUploadResponse(
        pdf_id=pdf_id,
        filename=file.filename,
        file_size=file_size,
        folder=None,
        created_at=now
    )

@api_router.get("/pdfs", response_model=List[PDFResponse])
async def get_pdfs(request: Request, folder: Optional[str] = None):
    user = await get_current_user(request)
    
    query = {"user_id": user["user_id"]}
    if folder:
        query["folder"] = folder
    
    pdfs = await db.pdfs.find(query, {"_id": 0}).to_list(1000)
    
    for pdf in pdfs:
        if isinstance(pdf.get("created_at"), str):
            pdf["created_at"] = datetime.fromisoformat(pdf["created_at"])
        if "original_filename" not in pdf:
            pdf["original_filename"] = pdf["filename"]
    
    return [PDFResponse(**pdf) for pdf in pdfs]

@api_router.put("/pdfs/{pdf_id}/rename")
async def rename_pdf(pdf_id: str, data: PDFRename, request: Request):
    user = await get_current_user(request)
    
    result = await db.pdfs.update_one(
        {"pdf_id": pdf_id, "user_id": user["user_id"]},
        {"$set": {"filename": data.filename}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="PDF not found")
    
    return {"message": "PDF renamed successfully", "filename": data.filename}

@api_router.put("/pdfs/{pdf_id}/move")
async def move_pdf(pdf_id: str, data: PDFMove, request: Request):
    user = await get_current_user(request)
    
    # Verify folder exists if specified
    if data.folder:
        folder = await db.folders.find_one({"folder_id": data.folder, "user_id": user["user_id"]})
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
    
    result = await db.pdfs.update_one(
        {"pdf_id": pdf_id, "user_id": user["user_id"]},
        {"$set": {"folder": data.folder}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="PDF not found")
    
    return {"message": "PDF moved successfully"}

@api_router.delete("/pdfs/{pdf_id}")
async def delete_pdf(pdf_id: str, request: Request):
    user = await get_current_user(request)
    
    pdf = await db.pdfs.find_one({"pdf_id": pdf_id, "user_id": user["user_id"]}, {"_id": 0})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    
    # Delete file from Supabase-backed storage (with legacy local-file fallback)
    storage_key = pdf.get("storage_key")
    if storage_key:
        await db.delete_file(storage_key)
    elif pdf.get("file_path"):
        file_path = Path(pdf["file_path"])
        if file_path.exists():
            await aiofiles.os.remove(file_path)
    
    # Delete from database
    await db.pdfs.delete_one({"pdf_id": pdf_id})
    
    # Update storage
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"storage_used": -pdf["file_size"]}}
    )
    
    # Revoke all links for this PDF
    await db.links.update_many(
        {"pdf_id": pdf_id},
        {"$set": {"status": "revoked"}}
    )
    
    return {"message": "PDF deleted successfully"}

# ==================== LINK ENDPOINTS ====================

@api_router.post("/links", response_model=LinkResponse)
async def create_link(link_data: LinkCreate, request: Request):
    user = await get_current_user(request)
    
    # Verify PDF ownership
    pdf = await db.pdfs.find_one({"pdf_id": link_data.pdf_id, "user_id": user["user_id"]}, {"_id": 0})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    
    # Check subscription
    if user.get("subscription_status") != "active":
        raise HTTPException(status_code=403, detail="Active subscription required")
    
    link_id = f"link_{uuid.uuid4().hex[:12]}"
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    
    expiry_duration_seconds = None
    expires_at = None

    if link_data.expiry_mode not in {"countdown", "fixed", "manual"}:
        raise HTTPException(status_code=400, detail="Invalid expiry mode")

    if link_data.expiry_mode == "countdown":
        days = int(link_data.expiry_days or 0)
        hours = int(link_data.expiry_hours or 0)
        minutes = int(link_data.expiry_minutes or 0)
        seconds = int(link_data.expiry_seconds or 0)

        if any(value < 0 for value in [days, hours, minutes, seconds]):
            raise HTTPException(status_code=400, detail="Countdown values cannot be negative")
        if minutes > 59 or seconds > 59:
            raise HTTPException(status_code=400, detail="Minutes and seconds must be between 0 and 59")

        expiry_duration_seconds = (
            days * 86400 +
            hours * 3600 +
            minutes * 60 +
            seconds
        )
        if expiry_duration_seconds <= 0:
            raise HTTPException(status_code=400, detail="Countdown duration must be greater than zero")
    elif link_data.expiry_mode == "fixed":
        if not link_data.expiry_fixed_datetime:
            raise HTTPException(status_code=400, detail="Fixed expiry datetime is required")
        expires_at = link_data.expiry_fixed_datetime
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            raise HTTPException(status_code=400, detail="Fixed expiry must be in the future")
    
    link_doc = {
        "link_id": link_id,
        "pdf_id": link_data.pdf_id,
        "user_id": user["user_id"],
        "token": token,
        "expiry_mode": link_data.expiry_mode,
        "expiry_duration_seconds": expiry_duration_seconds,
        "expiry_fixed_datetime": expires_at.isoformat() if expires_at else None,
        "first_open_at": None,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "open_count": 0,
        "unique_ips": [],
        "ip_sessions": {},  # Track per-IP countdown sessions
        "status": "active",
        "custom_expired_url": link_data.custom_expired_url,
        "custom_expired_message": link_data.custom_expired_message,
        "created_at": now.isoformat(),
        "access_log": []  # Detailed access log
    }
    
    await db.links.insert_one(link_doc)
    
    link_doc["created_at"] = now
    link_doc["expires_at"] = expires_at
    link_doc["expiry_fixed_datetime"] = expires_at
    
    return LinkResponse(**link_doc)

@api_router.get("/links", response_model=List[LinkResponse])
async def get_links(request: Request):
    user = await get_current_user(request)
    links = await db.links.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    
    for link in links:
        for field in ["created_at", "first_open_at", "expires_at", "expiry_fixed_datetime"]:
            if isinstance(link.get(field), str):
                link[field] = datetime.fromisoformat(link[field])
    
    return [LinkResponse(**link) for link in links]

@api_router.get("/links/{link_id}/stats")
async def get_link_stats(link_id: str, request: Request):
    user = await get_current_user(request)
    
    link = await db.links.find_one({"link_id": link_id, "user_id": user["user_id"]}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    
    return {
        "link_id": link_id,
        "open_count": link.get("open_count", 0),
        "unique_ips": link.get("unique_ips", []),
        "unique_ip_count": len(link.get("unique_ips", [])),
        "access_log": link.get("access_log", [])[-50:],  # Last 50 accesses
        "ip_sessions": link.get("ip_sessions", {}),
        "status": link.get("status"),
        "created_at": link.get("created_at"),
        "first_open_at": link.get("first_open_at"),
        "expires_at": link.get("expires_at")
    }

@api_router.delete("/links/{link_id}")
async def delete_link(link_id: str, request: Request):
    user = await get_current_user(request)
    
    result = await db.links.delete_one({"link_id": link_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    
    return {"message": "Link deleted successfully"}

@api_router.post("/links/{link_id}/revoke")
async def revoke_link(link_id: str, request: Request):
    user = await get_current_user(request)
    
    result = await db.links.update_one(
        {"link_id": link_id, "user_id": user["user_id"]},
        {"$set": {"status": "revoked"}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    
    return {"message": "Link revoked successfully"}

# ==================== PUBLIC VIEWER ENDPOINTS ====================

@api_router.get("/view/{token}")
async def access_link(token: str, request: Request):
    link = await db.links.find_one({"token": token}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    
    # Check link status
    if link["status"] == "revoked":
        return LinkAccessResponse(
            status="revoked",
            custom_expired_url=link.get("custom_expired_url"),
            custom_expired_message=link.get("custom_expired_message") or "This link has been revoked"
        )
    
    # Check user subscription
    user = await db.users.find_one({"user_id": link["user_id"]}, {"_id": 0})
    if not user or user.get("subscription_status") != "active":
        return LinkAccessResponse(
            status="expired",
            custom_expired_message="The owner's subscription is inactive"
        )
    
    now = datetime.now(timezone.utc)
    client_ip = _get_client_ip(request)
    session_key = _ip_session_key(client_ip)
    viewer_id = f"{client_ip}_{secrets.token_hex(4)}"  # Unique viewer session
    
    # Handle expiry logic
    if link["expiry_mode"] == "countdown":
        # For countdown mode, each IP gets their own countdown!
        ip_sessions = link.get("ip_sessions", {})
        ip_session = ip_sessions.get(session_key)

        if ip_session:
            # This IP has already opened the link
            first_open = datetime.fromisoformat(ip_session["first_open"])
            if first_open.tzinfo is None:
                first_open = first_open.replace(tzinfo=timezone.utc)
            expires_at = first_open + timedelta(seconds=link["expiry_duration_seconds"])
            
            if now >= expires_at:
                # This IP's session has expired
                return LinkAccessResponse(
                    status="expired",
                    custom_expired_url=link.get("custom_expired_url"),
                    custom_expired_message=link.get("custom_expired_message") or "Your viewing session has expired"
                )
            
            remaining_seconds = max(0, int((expires_at - now).total_seconds()))
        else:
            # New IP - start their countdown
            ip_sessions[session_key] = {
                "ip": client_ip,
                "first_open": now.isoformat(),
                "expires_at": (now + timedelta(seconds=link["expiry_duration_seconds"])).isoformat()
            }
            expires_at = now + timedelta(seconds=link["expiry_duration_seconds"])
            remaining_seconds = link["expiry_duration_seconds"]
            
            # Update first_open_at if this is the very first access
            if not link.get("first_open_at"):
                await db.links.update_one(
                    {"token": token},
                    {"$set": {"first_open_at": now.isoformat()}}
                )
            
            # Save IP session
            await db.links.update_one(
                {"token": token},
                {"$set": {f"ip_sessions.{session_key}": ip_sessions[session_key]}}
            )
    
    elif link["expiry_mode"] == "fixed" and link.get("expires_at"):
        expires_at_str = link["expires_at"]
        if isinstance(expires_at_str, str):
            expires_at = datetime.fromisoformat(expires_at_str)
        else:
            expires_at = expires_at_str
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if now >= expires_at:
            await db.links.update_one({"token": token}, {"$set": {"status": "expired"}})
            return LinkAccessResponse(
                status="expired",
                custom_expired_url=link.get("custom_expired_url"),
                custom_expired_message=link.get("custom_expired_message") or "This link has expired"
            )
        
        remaining_seconds = max(0, int((expires_at - now).total_seconds()))
    else:
        # Manual mode - no expiry
        expires_at = None
        remaining_seconds = None
    
    # Log access
    access_entry = {
        "ip": client_ip,
        "timestamp": now.isoformat(),
        "user_agent": request.headers.get("user-agent", "unknown")[:200]
    }
    
    # Update access stats
    update_ops = {
        "$inc": {"open_count": 1},
        "$push": {"access_log": {"$each": [access_entry], "$slice": -100}}  # Keep last 100
    }
    if client_ip not in link.get("unique_ips", []):
        update_ops["$addToSet"] = {"unique_ips": client_ip}
    
    await db.links.update_one({"token": token}, update_ops)
    
    return LinkAccessResponse(
        status="active",
        pdf_url=f"/api/view/{token}/pdf",
        expires_at=expires_at if expires_at else None,
        remaining_seconds=remaining_seconds,
        watermark_data={
            "ip": client_ip,
            "timestamp": now.isoformat(),
            "link_id": link["link_id"]
        },
        viewer_id=viewer_id
    )

@api_router.get("/view/{token}/pdf")
async def get_pdf_file(token: str, request: Request):
    link = await db.links.find_one({"token": token}, {"_id": 0})
    if not link or link["status"] == "revoked":
        raise HTTPException(status_code=404, detail="Link not found or revoked")
    
    client_ip = _get_client_ip(request)
    session_key = _ip_session_key(client_ip)
    now = datetime.now(timezone.utc)
    
    # Check expiry based on mode
    if link["expiry_mode"] == "countdown":
        ip_sessions = link.get("ip_sessions", {})
        ip_session = ip_sessions.get(session_key)

        # Backward compatibility with any older session shape where the key was not hashed.
        if not ip_session:
            for value in ip_sessions.values():
                if isinstance(value, dict) and value.get("ip") == client_ip and value.get("expires_at"):
                    ip_session = value
                    break

        if ip_session:
            expires_at = datetime.fromisoformat(ip_session["expires_at"])
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if now >= expires_at:
                raise HTTPException(status_code=410, detail="Your viewing session has expired")
        else:
            # If no pre-session exists (e.g., proxy/IP mismatch), bootstrap it here.
            duration = int(link.get("expiry_duration_seconds") or 0)
            expires_at = now + timedelta(seconds=duration)
            new_session = {
                "ip": client_ip,
                "first_open": now.isoformat(),
                "expires_at": expires_at.isoformat()
            }
            update_ops = {"$set": {f"ip_sessions.{session_key}": new_session}}
            if not link.get("first_open_at"):
                update_ops["$set"]["first_open_at"] = now.isoformat()
            await db.links.update_one({"token": token}, update_ops)
    
    elif link["expiry_mode"] == "fixed" and link.get("expires_at"):
        expires_at_str = link["expires_at"]
        expires_at = datetime.fromisoformat(expires_at_str) if isinstance(expires_at_str, str) else expires_at_str
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if now >= expires_at:
            raise HTTPException(status_code=410, detail="Link expired")
    
    pdf = await db.pdfs.find_one({"pdf_id": link["pdf_id"]}, {"_id": 0})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    
    headers = {
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate"
    }

    storage_key = pdf.get("storage_key")
    if storage_key:
        file_row = await db.get_file(storage_key)
        if not file_row:
            raise HTTPException(status_code=404, detail="PDF file not found")
        return StreamingResponse(
            io.BytesIO(file_row["content"]),
            media_type=file_row.get("content_type") or "application/pdf",
            headers=headers,
        )

    # Legacy fallback for pre-migration local files
    if pdf.get("file_path"):
        file_path = Path(pdf["file_path"])
        if file_path.exists():
            return FileResponse(file_path, media_type="application/pdf", headers=headers)

    raise HTTPException(status_code=404, detail="PDF file not found")

# ==================== SUBSCRIPTION ENDPOINTS ====================

@api_router.post("/subscription/checkout")
async def create_subscription_checkout(data: SubscriptionCreate, request: Request):
    user = await get_current_user(request)
    
    if data.plan not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    plan_info = SUBSCRIPTION_PLANS[data.plan]
    stripe_config = await _get_active_stripe_config()
    stripe_key = stripe_config["active_key"]

    if not stripe_key:
        if stripe_config["mode"] == "sandbox":
            raise HTTPException(status_code=400, detail="Stripe sandbox key is not configured")
        raise HTTPException(status_code=400, detail="Stripe live key is not configured")

    amount_cents = int(round(plan_info["price"] * 100))
    host_url = data.origin_url.rstrip('/')
    stripe_session = await _stripe_api_request(
        method="POST",
        path="/v1/checkout/sessions",
        api_key=stripe_key,
        data={
            "mode": "payment",
            "success_url": f"{host_url}/dashboard?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{host_url}/pricing?payment=cancelled",
            "metadata[user_id]": user["user_id"],
            "metadata[plan]": data.plan,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": "eur",
            "line_items[0][price_data][unit_amount]": str(amount_cents),
            "line_items[0][price_data][product_data][name]": f"{plan_info['name']} Plan",
            "line_items[0][price_data][product_data][description]": f"{plan_info['storage_mb']} MB storage",
        }
    )
    session_id = stripe_session.get("id")
    session_url = stripe_session.get("url")
    if not session_id or not session_url:
        raise HTTPException(status_code=400, detail="Stripe did not return a checkout URL")
    
    # Store payment transaction
    await db.payment_transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "session_id": session_id,
        "amount": plan_info["price"],
        "currency": "eur",
        "plan": data.plan,
        "payment_status": "pending",
        "stripe_mode": stripe_config["mode"],
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"url": session_url, "session_id": session_id}

@api_router.get("/subscription/status/{session_id}")
async def check_subscription_status(session_id: str, request: Request):
    user = await get_current_user(request)
    txn = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    stripe_config = await _get_active_stripe_config()
    stripe_key = stripe_config["active_key"]
    if not stripe_key:
        raise HTTPException(status_code=400, detail="Stripe key is not configured")

    stripe_session = await _stripe_api_request(
        method="GET",
        path=f"/v1/checkout/sessions/{session_id}",
        api_key=stripe_key
    )

    payment_status = stripe_session.get("payment_status", "unpaid")
    checkout_status = stripe_session.get("status", "open")
    amount_total = stripe_session.get("amount_total") or 0

    if payment_status == "paid" and txn.get("payment_status") != "completed":
        # Update transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "completed"}}
        )
        
        # Activate subscription
        plan = txn.get("plan", "basic")
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {
                "$set": {
                    "subscription_status": "active",
                    "plan": plan,
                    "subscription_expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                }
            }
        )

    return {
        "status": checkout_status,
        "payment_status": payment_status,
        "amount": amount_total / 100
    }

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")

    try:
        if STRIPE_WEBHOOK_SECRET and not _verify_stripe_signature(body, signature, STRIPE_WEBHOOK_SECRET):
            raise HTTPException(status_code=400, detail="Invalid Stripe signature")

        event = json.loads(body.decode("utf-8"))
        event_type = event.get("type")

        if event_type == "checkout.session.completed":
            session_data = event.get("data", {}).get("object", {})
            metadata = session_data.get("metadata") or {}
            user_id = metadata.get("user_id")
            plan = metadata.get("plan", "basic")
            session_id = session_data.get("id")

            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {
                        "$set": {
                            "subscription_status": "active",
                            "plan": plan,
                            "subscription_expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                        }
                    }
                )
                if session_id:
                    await db.payment_transactions.update_one(
                        {"session_id": session_id},
                        {"$set": {"payment_status": "completed"}}
                    )
        
        return {"received": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

@api_router.get("/subscription/plans")
async def get_plans():
    return SUBSCRIPTION_PLANS

# ==================== ADMIN ENDPOINTS ====================

@api_router.get("/admin/users")
async def admin_get_users(request: Request):
    await get_current_admin(request)
    
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    
    # Get PDF and link counts for each user
    for user in users:
        pdf_count = await db.pdfs.count_documents({"user_id": user["user_id"]})
        link_count = await db.links.count_documents({"user_id": user["user_id"]})
        user["pdf_count"] = pdf_count
        user["link_count"] = link_count
        if isinstance(user.get("created_at"), str):
            user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return users

@api_router.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, update_data: AdminUserUpdate, request: Request):
    await get_current_admin(request)
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User updated successfully"}

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request):
    admin = await get_current_admin(request)
    
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    # Delete user's PDFs
    user_pdfs = await db.pdfs.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    for pdf in user_pdfs:
        if pdf.get("storage_key"):
            await db.delete_file(pdf["storage_key"])
            continue
        file_path_value = pdf.get("file_path")
        if file_path_value:
            file_path = Path(file_path_value)
            if file_path.exists():
                await aiofiles.os.remove(file_path)

    await db.delete_files_by_user(user_id)
    
    await db.pdfs.delete_many({"user_id": user_id})
    await db.links.delete_many({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.folders.delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})
    
    return {"message": "User deleted successfully"}

@api_router.get("/admin/links")
async def admin_get_links(request: Request):
    await get_current_admin(request)
    
    links = await db.links.find({}, {"_id": 0}).to_list(1000)
    
    # Enrich with user and PDF info
    for link in links:
        user = await db.users.find_one({"user_id": link["user_id"]}, {"_id": 0, "name": 1, "email": 1})
        pdf = await db.pdfs.find_one({"pdf_id": link["pdf_id"]}, {"_id": 0, "filename": 1})
        
        link["user_name"] = user.get("name") if user else "Unknown"
        link["user_email"] = user.get("email") if user else "Unknown"
        link["pdf_name"] = pdf.get("filename") if pdf else "Unknown"
        
        for field in ["created_at", "first_open_at", "expires_at", "expiry_fixed_datetime"]:
            if isinstance(link.get(field), str):
                link[field] = datetime.fromisoformat(link[field])
    
    return links

@api_router.post("/admin/links/{link_id}/revoke")
async def admin_revoke_link(link_id: str, request: Request):
    await get_current_admin(request)
    
    result = await db.links.update_one(
        {"link_id": link_id},
        {"$set": {"status": "revoked"}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    
    return {"message": "Link revoked successfully"}

@api_router.delete("/admin/links/{link_id}")
async def admin_delete_link(link_id: str, request: Request):
    await get_current_admin(request)
    
    result = await db.links.delete_one({"link_id": link_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    
    return {"message": "Link deleted successfully"}

@api_router.get("/admin/stats")
async def admin_get_stats(request: Request):
    await get_current_admin(request)
    
    total_users = await db.users.count_documents({})
    active_subscribers = await db.users.count_documents({"subscription_status": "active"})
    total_pdfs = await db.pdfs.count_documents({})
    total_links = await db.links.count_documents({})
    active_links = await db.links.count_documents({"status": "active"})
    
    # Storage stats
    pipeline = [
        {"$group": {"_id": None, "total_storage": {"$sum": "$storage_used"}}}
    ]
    storage_result = await db.users.aggregate(pipeline).to_list(1)
    total_storage = storage_result[0]["total_storage"] if storage_result else 0
    
    # Total views
    views_pipeline = [
        {"$group": {"_id": None, "total_views": {"$sum": "$open_count"}}}
    ]
    views_result = await db.links.aggregate(views_pipeline).to_list(1)
    total_views = views_result[0]["total_views"] if views_result else 0
    
    # Unique viewers (count of all unique IPs across all links)
    unique_ips_pipeline = [
        {"$unwind": "$unique_ips"},
        {"$group": {"_id": "$unique_ips"}},
        {"$count": "total"}
    ]
    unique_result = await db.links.aggregate(unique_ips_pipeline).to_list(1)
    total_unique_viewers = unique_result[0]["total"] if unique_result else 0
    
    return {
        "total_users": total_users,
        "active_subscribers": active_subscribers,
        "total_pdfs": total_pdfs,
        "total_links": total_links,
        "active_links": active_links,
        "total_storage_bytes": total_storage,
        "total_views": total_views,
        "total_unique_viewers": total_unique_viewers
    }

# ==================== ADMIN PLATFORM SETTINGS ====================

@api_router.get("/admin/settings/stripe")
async def admin_get_stripe_settings(request: Request):
    await get_current_admin(request)
    return await _get_active_stripe_config()

@api_router.put("/admin/settings/stripe")
async def admin_update_stripe_settings(request: Request, config: StripeConfigUpdate):
    await get_current_admin(request)
    update_data = {"key": "stripe", "updated_at": datetime.now(timezone.utc).isoformat()}
    if config.stripe_key is not None:
        if config.stripe_key and not (config.stripe_key.startswith("sk_test_") or config.stripe_key.startswith("sk_live_")):
            raise HTTPException(status_code=400, detail="Invalid Stripe key format")

        key_type = _stripe_key_type(config.stripe_key)
        if key_type == "live":
            update_data["live_key"] = config.stripe_key
        elif key_type == "sandbox":
            update_data["sandbox_key"] = config.stripe_key

        # Keep legacy field for backward compatibility with old deployments.
        update_data["stripe_key"] = config.stripe_key
    if config.mode is not None:
        if config.mode not in ["sandbox", "live"]:
            raise HTTPException(status_code=400, detail="Mode must be 'sandbox' or 'live'")
        update_data["mode"] = config.mode
    
    await db.platform_settings.update_one(
        {"key": "stripe"},
        {"$set": update_data},
        upsert=True
    )
    return {"message": "Stripe settings updated successfully"}


@api_router.post("/domains")
async def add_domain(domain_data: DomainCreate, request: Request):
    user = await get_current_user(request)
    
    # Check subscription - enterprise only
    if user.get("plan") != "enterprise":
        raise HTTPException(status_code=403, detail="Custom domains require Enterprise plan")
    
    domain_id = f"dom_{uuid.uuid4().hex[:12]}"
    verification_token = secrets.token_urlsafe(32)
    
    domain_doc = {
        "domain_id": domain_id,
        "user_id": user["user_id"],
        "domain": domain_data.domain,
        "verification_token": verification_token,
        "verification_status": "pending",
        "ssl_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.domains.insert_one(domain_doc)
    
    return {
        "domain_id": domain_id,
        "verification_token": verification_token,
        "cname_target": "autodestroy.example.com",
        "instructions": f"Add a TXT record with value: autodestroy-verify={verification_token}"
    }

@api_router.get("/domains")
async def get_domains(request: Request):
    user = await get_current_user(request)
    domains = await db.domains.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    return domains

@api_router.delete("/domains/{domain_id}")
async def delete_domain(domain_id: str, request: Request):
    user = await get_current_user(request)
    
    result = await db.domains.delete_one({"domain_id": domain_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Domain not found")
    
    return {"message": "Domain deleted successfully"}

# ==================== DASHBOARD STATS ====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(request: Request):
    user = await get_current_user(request)
    
    pdf_count = await db.pdfs.count_documents({"user_id": user["user_id"]})
    link_count = await db.links.count_documents({"user_id": user["user_id"]})
    active_links = await db.links.count_documents({"user_id": user["user_id"], "status": "active"})
    expired_links = await db.links.count_documents({"user_id": user["user_id"], "status": "expired"})
    revoked_links = await db.links.count_documents({"user_id": user["user_id"], "status": "revoked"})
    
    # Get total views
    pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$group": {"_id": None, "total_views": {"$sum": "$open_count"}}}
    ]
    views_result = await db.links.aggregate(pipeline).to_list(1)
    total_views = views_result[0]["total_views"] if views_result else 0
    
    # Get unique viewers
    unique_pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$unwind": "$unique_ips"},
        {"$group": {"_id": "$unique_ips"}},
        {"$count": "total"}
    ]
    unique_result = await db.links.aggregate(unique_pipeline).to_list(1)
    unique_viewers = unique_result[0]["total"] if unique_result else 0
    
    # Get recent activity (last 7 days views)
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    activity_pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$unwind": "$access_log"},
        {"$match": {"access_log.timestamp": {"$gte": seven_days_ago}}},
        {"$count": "recent_views"}
    ]
    activity_result = await db.links.aggregate(activity_pipeline).to_list(1)
    recent_views = activity_result[0]["recent_views"] if activity_result else 0
    
    plan = user.get("plan", "none")
    plan_info = SUBSCRIPTION_PLANS.get(plan, {"storage_mb": 0, "links_per_month": 0})
    
    return {
        "pdf_count": pdf_count,
        "link_count": link_count,
        "active_links": active_links,
        "expired_links": expired_links,
        "revoked_links": revoked_links,
        "total_views": total_views,
        "unique_viewers": unique_viewers,
        "recent_views_7d": recent_views,
        "storage_used": user.get("storage_used", 0),
        "storage_limit": plan_info["storage_mb"] * 1024 * 1024,
        "plan": plan,
        "subscription_status": user.get("subscription_status", "inactive")
    }

# ==================== ROOT ENDPOINT ====================

@api_router.get("/")
async def root():
    return {"message": "Autodestroy PDF Platform API", "version": "1.0.0"}

# Include the router in the main app
app.include_router(api_router)

CORS_ORIGINS = _env_csv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    await db.close()
