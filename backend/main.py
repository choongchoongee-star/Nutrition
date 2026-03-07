import os
import json
import logging
import sys
import base64
import requests
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
        logger.info("Supabase connected")
    except Exception as e:
        logger.error(f"Supabase init error: {e}")

app = FastAPI()

# CORS 설정 (가장 바깥쪽)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 모든 응답에 CORS 헤더 강제 주입 미들웨어 (에러 상황 대비)
@app.middleware("http")
async def force_cors(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# --- 데이터 모델 ---
class Meal(BaseModel):
    id: Optional[int] = None
    date: str
    meal_type: str
    menu_name: str
    weight_g: float  # 복구됨!
    kcal: float
    carbs_g: float
    protein_g: float
    fat_g: float
    image_uri: Optional[str] = None
    timestamp: Optional[str] = None

class Goal(BaseModel):
    target_kcal: float
    target_carbs: float
    target_protein: float
    target_fat: float

# 응답 헬퍼
def json_res(data, status=200):
    return JSONResponse(content=data, status_code=status, headers={"Access-Control-Allow-Origin": "*"})

# --- API 엔드포인트 ---

@app.get("/api/v1/health")
@app.get("/health")
async def health():
    return json_res({
        "status": "online",
        "version": "3.3 (Full Restore)",
        "db_ready": supabase is not None,
        "env_check": {"GOOGLE": bool(GOOGLE_API_KEY), "URL": bool(SUPABASE_URL), "KEY": bool(SUPABASE_KEY)}
    })

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY: return json_res({"error": "No API Key"}, 500)
    try:
        content = await image.read()
        base64_img = base64.b64encode(content).decode('utf-8')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
        
        prompt = "Return ONLY JSON: {'menu_name':str,'weight_g':float,'kcal':float,'carbs_g':float,'protein_g':float,'fat_g':float}"
        payload = {
            "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64_img}}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 400}
        }
        
        resp = requests.post(url, json=payload, timeout=20)
        if resp.status_code != 200: return json_res({"error": f"AI Error {resp.status_code}", "detail": resp.text}, 500)
        
        txt = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        start, end = txt.find('{'), txt.rfind('}') + 1
        return json_res(json.loads(txt[start:end]))
    except Exception as e:
        return json_res({"error": str(e)}, 500)

@app.get("/api/v1/meals")
async def get_meals(date: str):
    if not supabase: return json_res({"error": "DB not configured"}, 503)
    try:
        res = supabase.table("meals").select("*").eq("date", date).execute()
        return json_res(res.data)
    except Exception as e: return json_res({"error": "Fetch failed", "detail": str(e)}, 500)

@app.post("/api/v1/meals")
async def add_meal(meal: Meal):
    if not supabase: return json_res({"error": "DB not configured"}, 503)
    try:
        data = meal.dict(exclude_none=True)
        res = supabase.table("meals").insert(data).execute()
        return json_res(res.data[0])
    except Exception as e: return json_res({"error": "Insert failed", "detail": str(e)}, 500)

@app.delete("/api/v1/meals/{meal_id}")
async def delete_meal(meal_id: int):
    if not supabase: return json_res({"error": "DB not configured"}, 503)
    try:
        supabase.table("meals").delete().eq("id", meal_id).execute()
        return json_res({"status": "deleted"})
    except Exception as e: return json_res({"error": "Delete failed", "detail": str(e)}, 500)

@app.get("/api/v1/goals")
async def get_goals():
    if not supabase: return json_res({"error": "DB not configured"}, 503)
    try:
        res = supabase.table("goals").select("*").order("id", desc=True).limit(1).execute()
        if not res.data: return json_res({"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50})
        return json_res(res.data[0])
    except Exception as e: return json_res({"error": "Goals fetch failed", "detail": str(e)}, 500)

@app.post("/api/v1/goals")
async def set_goals(goal: Goal):
    if not supabase: return json_res({"error": "DB not ready"}, 503)
    try:
        res = supabase.table("goals").insert(goal.dict()).execute()
        return json_res(res.data[0])
    except Exception as e: return json_res({"error": "Goals save failed", "detail": str(e)}, 500)
