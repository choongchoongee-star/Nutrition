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

# 로깅
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase 연결 성공")
    except Exception as e:
        logger.error(f"Supabase 연결 실패: {e}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.middleware("http")
async def force_cors(request: Request, call_next):
    try:
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        logger.error(f"서버 에러 발생: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": "서버 내부 오류", "detail": str(e)},
            headers={"Access-Control-Allow-Origin": "*"}
        )

# 데이터 모델 (422 에러 방지를 위해 모든 필드를 더 유연하게 설정)
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

# --- API ---

@app.get("/api/v1/health")
@app.get("/health")
async def health():
    return json_res({
        "status": "online",
        "version": "3.5 (Korean Support)",
        "db_ready": supabase is not None
    })

@app.get("/api/v1/meals")
async def get_meals(date: str):
    if not supabase: return json_res({"error": "DB 연결 안됨"}, 503)
    try:
        res = supabase.table("meals").select("*").eq("date", date).execute()
        return json_res(res.data)
    except Exception as e:
        return json_res({"error": "조회 실패", "detail": str(e)}, 500)

@app.post("/api/v1/meals")
async def add_meal(meal: Meal):
    if not supabase: return json_res({"error": "DB 연결 안됨"}, 503)
    try:
        data = meal.dict(exclude_none=True)
        res = supabase.table("meals").insert(data).execute()
        return json_res(res.data[0])
    except Exception as e:
        logger.error(f"저장 실패: {str(e)}")
        return json_res({"error": "저장 실패", "detail": str(e)}, 500)

@app.delete("/api/v1/meals/{meal_id}")
async def delete_meal(meal_id: int):
    if not supabase: return json_res({"error": "DB 연결 안됨"}, 503)
    try:
        supabase.table("meals").delete().eq("id", meal_id).execute()
        return json_res({"status": "삭제됨"})
    except Exception as e:
        return json_res({"error": "삭제 실패", "detail": str(e)}, 500)

@app.get("/api/v1/goals")
async def get_goals():
    if not supabase: return json_res({"error": "DB 연결 안됨"}, 503)
    try:
        res = supabase.table("goals").select("*").order("id", desc=True).limit(1).execute()
        if not res.data:
            return json_res({"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50})
        return json_res(res.data[0])
    except Exception as e:
        return json_res({"error": "목표 조회 실패", "detail": str(e)}, 500)

@app.post("/api/v1/goals")
async def set_goals(goal: Goal):
    if not supabase: return json_res({"error": "DB 연결 안됨"}, 503)
    try:
        res = supabase.table("goals").insert(goal.dict()).execute()
        return json_res(res.data[0])
    except Exception as e:
        return json_res({"error": "목표 저장 실패", "detail": str(e)}, 500)

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY: return json_res({"error": "API 키 없음"}, 500)
    try:
        content = await image.read()
        base64_img = base64.b64encode(content).decode('utf-8')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
        prompt = "음식을 분석하고 JSON으로만 응답: {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}"
        payload = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64_img}}]}], "generationConfig": {"temperature": 0.1}}
        resp = requests.post(url, json=payload, timeout=20)
        txt = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        start, end = txt.find('{'), txt.rfind('}') + 1
        return json_res(json.loads(txt[start:end]))
    except Exception as e: return json_res({"error": str(e)}, 500)
