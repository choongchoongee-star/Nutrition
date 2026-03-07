import os
import json
import logging
import sys
import base64
import requests
import traceback
from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from supabase import create_client, Client

# 로깅 설정
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()

# 환경 변수 로드
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Supabase 클라이언트 초기화
supabase: Client = None
try:
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase connected")
except Exception as e:
    logger.error(f"Supabase connection failed: {str(e)}")

app = FastAPI()

# 1. CORS 설정을 가장 먼저 추가 (가장 중요)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 2. 모든 응답에 CORS 헤더를 강제로 주입하는 미들웨어 (이중 방어)
@app.middleware("http")
async def add_cors_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# 모델 정의
class Meal(BaseModel):
    id: Optional[int] = None
    date: str
    meal_type: str
    menu_name: str
    kcal: float
    carbs_g: float
    protein_g: float
    fat_g: float
    image_uri: Optional[str] = None

class Goal(BaseModel):
    target_kcal: float
    target_carbs: float
    target_protein: float
    target_fat: float

def json_res(data, status=200):
    return JSONResponse(content=data, status_code=status, headers={"Access-Control-Allow-Origin": "*"})

# --- 기본 API ---

@app.get("/api/v1/health")
@app.get("/health")
async def health():
    return json_res({
        "status": "online",
        "version": "3.2 (CORS Fix)",
        "db_ready": supabase is not None,
        "env_check": {"URL": bool(SUPABASE_URL), "KEY": bool(SUPABASE_KEY)}
    })

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY: return json_res({"error": "Missing API Key"}, 500)
    try:
        content = await image.read()
        base64_image = base64.b64encode(content).decode('utf-8')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
        prompt = "Return ONLY JSON: {'menu_name':str,'kcal':float,'carbs_g':float,'protein_g':float,'fat_g':float}"
        payload = {
            "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64_image}}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 300}
        }
        response = requests.post(url, json=payload, timeout=15)
        txt = response.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        start, end = txt.find('{'), txt.rfind('}') + 1
        return json_res(json.loads(txt[start:end]))
    except Exception as e: return json_res({"error": str(e)}, 500)

# --- 데이터베이스 API ---

@app.get("/api/v1/meals")
async def get_meals(date: str):
    if not supabase: return json_res({"error": "DB not ready"}, 503)
    try:
        # Supabase 테이블 이름이 'meals'인지 확인 필요
        response = supabase.table("meals").select("*").eq("date", date).execute()
        return json_res(response.data)
    except Exception as e:
        logger.error(f"DB Fetch Error: {str(e)}")
        return json_res({"error": "DB Fetch Failed", "detail": str(e)}, 500)

@app.post("/api/v1/meals")
async def add_meal(meal: Meal):
    if not supabase: return json_res({"error": "DB not ready"}, 503)
    try:
        data = meal.dict(exclude_none=True)
        response = supabase.table("meals").insert(data).execute()
        return json_res(response.data[0])
    except Exception as e:
        logger.error(f"DB Insert Error: {str(e)}")
        return json_res({"error": "DB Insert Failed", "detail": str(e)}, 500)

@app.get("/api/v1/goals")
async def get_goals():
    if not supabase: return json_res({"error": "DB not ready"}, 503)
    try:
        response = supabase.table("goals").select("*").order("id", desc=True).limit(1).execute()
        if not response.data:
            return json_res({"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50})
        return json_res(response.data[0])
    except Exception as e:
        return json_res({"error": "DB Goals Fetch Failed", "detail": str(e)}, 500)

@app.post("/api/v1/goals")
async def set_goals(goal: Goal):
    if not supabase: return json_res({"error": "DB not ready"}, 503)
    try:
        response = supabase.table("goals").insert(goal.dict()).execute()
        return json_res(response.data[0])
    except Exception as e:
        return json_res({"error": "DB Goals Update Failed", "detail": str(e)}, 500)
