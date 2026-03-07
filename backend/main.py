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
        logger.info("Supabase 연결 성공")
    except Exception as e:
        logger.error(f"Supabase 초기화 실패: {e}")

app = FastAPI()

# CORS 설정 (최상위 배치)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 응답 헬퍼 (모든 응답에 CORS 헤더 강제 주입)
def json_res(data, status=200):
    return JSONResponse(
        content=data, 
        status_code=status, 
        headers={"Access-Control-Allow-Origin": "*"}
    )

# 전역 에러 핸들러: 서버에서 어떤 에러가 나도 브라우저가 원인을 볼 수 있게 함
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    err_msg = traceback.format_exc()
    logger.error(f"서버 에러 발생: {err_msg}")
    return json_res({
        "error": "서버 로직 오류",
        "message": str(exc),
        "traceback": err_msg if os.getenv("DEBUG") == "True" else "로그를 확인하세요"
    }, 500)

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

# --- API 엔드포인트 ---

@app.get("/api/v1/health")
@app.get("/health")
async def health():
    return json_res({
        "status": "online",
        "version": "3.6 (Ultra Debug)",
        "db_ready": supabase is not None,
        "env_check": {"URL": bool(SUPABASE_URL), "KEY": bool(SUPABASE_KEY)}
    })

@app.get("/api/v1/meals")
async def get_meals(date: str):
    if not supabase: return json_res({"error": "DB 미설정"}, 503)
    try:
        # 가끔 라이브러리 버전에 따라 .execute() 방식이 다를 수 있으므로 예외처리 강화
        res = supabase.table("meals").select("*").eq("date", date).execute()
        return json_res(res.data if hasattr(res, 'data') else [])
    except Exception as e:
        logger.error(f"식단 조회 실패: {e}")
        return json_res({"error": "조회 실패", "detail": str(e)}, 500)

@app.post("/api/v1/meals")
async def add_meal(meal: Meal):
    if not supabase: return json_res({"error": "DB 미설정"}, 503)
    try:
        data = meal.dict(exclude_none=True)
        # 422 에러 방지를 위해 데이터 전처리 (None 방지)
        for key in ['kcal', 'carbs_g', 'protein_g', 'fat_g', 'weight_g']:
            if data.get(key) is None: data[key] = 0.0
            
        res = supabase.table("meals").insert(data).execute()
        
        if not res.data or len(res.data) == 0:
            return json_res({"error": "저장 성공했으나 반환 데이터 없음"}, 200)
            
        return json_res(res.data[0])
    except Exception as e:
        logger.error(f"식단 저장 실패: {e}")
        return json_res({"error": "저장 실패", "detail": str(e)}, 500)

@app.get("/api/v1/goals")
async def get_goals_api():
    if not supabase: return json_res({"error": "DB 미설정"}, 503)
    try:
        res = supabase.table("goals").select("*").order("id", desc=True).limit(1).execute()
        if not res.data or len(res.data) == 0:
            return json_res({"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50})
        return json_res(res.data[0])
    except Exception as e:
        logger.error(f"목표 조회 실패: {e}")
        # DB 에러 시 서비스 중단을 막기 위해 기본값 반환
        return json_res({"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50})

@app.post("/api/v1/goals")
async def set_goals_api(goal: Goal):
    if not supabase: return json_res({"error": "DB 미설정"}, 503)
    try:
        res = supabase.table("goals").insert(goal.dict()).execute()
        return json_res(res.data[0])
    except Exception as e:
        return json_res({"error": "목표 저장 실패", "detail": str(e)}, 500)

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY: return json_res({"error": "AI API 키 없음"}, 500)
    try:
        content = await image.read()
        base64_img = base64.b64encode(content).decode('utf-8')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
        prompt = "Identify food and return JSON: {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}"
        payload = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64_img}}]}], "generationConfig": {"temperature": 0.1}}
        resp = requests.post(url, json=payload, timeout=20)
        txt = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        start, end = txt.find('{'), txt.rfind('}') + 1
        return json_res(json.loads(txt[start:end]))
    except Exception as e: return json_res({"error": "AI 분석 실패", "detail": str(e)}, 500)
