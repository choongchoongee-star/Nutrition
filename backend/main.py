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

# 로깅
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()

# 환경 변수
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 모든 응답에 CORS 강제 주입
@app.middleware("http")
async def force_cors(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# 데이터 모델
class Meal(BaseModel):
    id: Optional[int] = None
    date: str
    meal_type: str
    menu_name: str
    kcal: float = 0.0
    carbs_g: float = 0.0
    protein_g: float = 0.0
    fat_g: float = 0.0
    weight_g: Optional[float] = 0.0
    image_uri: Optional[str] = None

class Goal(BaseModel):
    target_kcal: float = 2000.0
    target_carbs: float = 250.0
    target_protein: float = 60.0
    target_fat: float = 50.0

def json_res(data, status=200):
    return JSONResponse(content=data, status_code=status, headers={"Access-Control-Allow-Origin": "*"})

# --- Supabase REST 직접 호출 헬퍼 ---
def sb_req(method, table, params=None, json_data=None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None, "Supabase 설정 누락"
    
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    try:
        resp = requests.request(method, url, headers=headers, params=params, json=json_data, timeout=10)
        if resp.status_code in [200, 201]:
            return resp.json(), None
        return None, f"SB Error {resp.status_code}: {resp.text}"
    except Exception as e:
        return None, str(e)

# --- API 엔드포인트 ---

@app.get("/api/v1/health")
async def health():
    return json_res({
        "status": "online",
        "version": "3.7 (Direct REST Mode)",
        "db_configured": bool(SUPABASE_URL and SUPABASE_KEY)
    })

@app.get("/api/v1/meals")
async def get_meals(date: str):
    data, err = sb_req("GET", "meals", params={"date": f"eq.{date}"})
    if err: return json_res({"error": "DB 조회 실패", "detail": err}, 500)
    return json_res(data or [])

@app.post("/api/v1/meals")
async def add_meal(meal: Meal):
    payload = meal.dict(exclude_none=True)
    data, err = sb_req("POST", "meals", json_data=payload)
    if err: return json_res({"error": "DB 저장 실패", "detail": err}, 500)
    return json_res(data[0] if data else payload)

@app.get("/api/v1/goals")
async def get_goals():
    data, err = sb_req("GET", "goals", params={"order": "id.desc", "limit": "1"})
    if err or not data:
        return json_res({"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50})
    return json_res(data[0])

@app.post("/api/v1/goals")
async def set_goals(goal: Goal):
    data, err = sb_req("POST", "goals", json_data=goal.dict())
    if err: return json_res({"error": "목표 저장 실패", "detail": err}, 500)
    return json_res(data[0] if data else goal.dict())

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY: return json_res({"error": "AI API 키 없음"}, 500)
    try:
        content = await image.read()
        base64_img = base64.b64encode(content).decode('utf-8')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
        prompt = "Return ONLY JSON: {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}"
        payload = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64_img}}]}], "generationConfig": {"temperature": 0.1}}
        resp = requests.post(url, json=payload, timeout=20)
        txt = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        start, end = txt.find('{'), txt.rfind('}') + 1
        return json_res(json.loads(txt[start:end]))
    except Exception as e: return json_res({"error": "AI 분석 실패", "detail": str(e)}, 500)
