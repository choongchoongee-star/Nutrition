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

# 환경 변수
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Supabase 초기화
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
    except Exception as e:
        logger.error(f"Supabase init error: {e}")

app = FastAPI()

# CORS 설정 (1순위 방어)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 모든 응답에 CORS 헤더 강제 주입 및 에러 포획 미들웨어 (2순위 방어)
@app.middleware("http")
async def safety_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        logger.error(f"CRITICAL ERROR: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": "Internal Server Error", "detail": str(e)},
            headers={"Access-Control-Allow-Origin": "*"}
        )

# 데이터 모델
class Meal(BaseModel):
    id: Optional[int] = None
    date: str
    meal_type: str
    menu_name: str
    weight_g: float
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

# --- API ---

@app.get("/api/v1/health")
@app.get("/health")
async def health():
    return json_res({
        "status": "online",
        "version": "3.4 (Safety Mode)",
        "db_ready": supabase is not None,
        "env_check": {"URL": bool(SUPABASE_URL), "KEY": bool(SUPABASE_KEY)}
    })

@app.get("/api/v1/meals")
async def get_meals(date: str):
    if not supabase: return json_res({"error": "DB not configured"}, 503)
    try:
        res = supabase.table("meals").select("*").eq("date", date).execute()
        return json_res(res.data)
    except Exception as e:
        logger.error(f"Fetch meals failed: {e}")
        return json_res({"error": "Fetch failed", "detail": str(e)}, 500)

@app.post("/api/v1/meals")
async def add_meal(meal: Meal):
    if not supabase: return json_res({"error": "DB not ready"}, 503)
    try:
        data = meal.dict(exclude_none=True)
        res = supabase.table("meals").insert(data).execute()
        if not res.data: return json_res({"error": "Insert failed, no data returned"}, 500)
        return json_res(res.data[0])
    except Exception as e:
        return json_res({"error": "Insert failed", "detail": str(e)}, 500)

@app.get("/api/v1/goals")
async def get_goals():
    if not supabase: return json_res({"error": "DB not ready"}, 503)
    try:
        # 최신 목표 1개만 가져오기
        res = supabase.table("goals").select("*").order("id", desc=True).limit(1).execute()
        if not res.data:
            # 데이터가 없으면 기본값 반환
            return json_res({"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50})
        return json_res(res.data[0])
    except Exception as e:
        return json_res({"error": "Goals fetch failed", "detail": str(e)}, 500)

@app.post("/api/v1/goals")
async def set_goals(goal: Goal):
    if not supabase: return json_res({"error": "DB not ready"}, 503)
    try:
        res = supabase.table("goals").insert(goal.dict()).execute()
        return json_res(res.data[0])
    except Exception as e:
        return json_res({"error": "Goals save failed", "detail": str(e)}, 500)

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY: return json_res({"error": "No API Key"}, 500)
    try:
        content = await image.read()
        base64_img = base64.b64encode(content).decode('utf-8')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
        prompt = "Identify food and return ONLY JSON: {'menu_name':str,'weight_g':float,'kcal':float,'carbs_g':float,'protein_g':float,'fat_g':float}"
        payload = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64_img}}]}], "generationConfig": {"temperature": 0.1}}
        resp = requests.post(url, json=payload, timeout=20)
        txt = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        start, end = txt.find('{'), txt.rfind('}') + 1
        return json_res(json.loads(txt[start:end]))
    except Exception as e: return json_res({"error": str(e)}, 500)
