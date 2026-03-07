import os
import json
import traceback
import logging
import sys
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

# 로깅
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    logger.info("Gemini API Key loaded successfully")
else:
    logger.error("CRITICAL: GOOGLE_API_KEY is missing from environment")

# FastAPI 앱 생성
app = FastAPI()

# 1. CORS 미들웨어를 가장 먼저(또는 가장 나중에) 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. 모든 응답에 CORS 헤더를 강제로 주입하는 미들웨어
@app.middleware("http")
async def force_cors_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        logger.error(f"Middleware caught error: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal Server Error", "detail": str(e)},
            headers={"Access-Control-Allow-Origin": "*"}
        )

class NutritionInfo(BaseModel):
    menu_name: str
    weight_g: float
    kcal: float
    carbs_g: float
    protein_g: float
    fat_g: float

@app.get("/api/v1/health")
@app.get("/health")
async def health():
    return {
        "status": "online",
        "version": "2.4",
        "key_set": bool(GOOGLE_API_KEY)
    }

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    # CORS 헤더를 직접 포함한 에러 반환용 헬퍼
    def error_res(code, msg):
        return JSONResponse(
            status_code=code,
            content={"error": msg},
            headers={"Access-Control-Allow-Origin": "*"}
        )

    if not GOOGLE_API_KEY:
        return error_res(500, "Server API Key not configured")

    try:
        content = await image.read()
        if not content:
            return error_res(400, "No image data")

        # 메모리 절약을 위해 최소한의 설정으로 호출
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = "음식 분석 JSON: {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}"
        
        response = model.generate_content([
            prompt,
            {"mime_type": image.content_type or "image/jpeg", "data": content}
        ])

        # 응답 텍스트 추출
        try:
            txt = response.text
        except Exception as e:
            return error_res(500, f"AI Safety Block or Error: {str(e)}")

        # 간단한 JSON 추출
        start = txt.find('{')
        end = txt.rfind('}')
        if start == -1 or end == -1:
            return error_res(500, "Invalid AI response format")
        
        data = json.loads(txt[start:end+1])
        return JSONResponse(content=data, headers={"Access-Control-Allow-Origin": "*"})

    except Exception as e:
        logger.error(traceback.format_exc())
        return error_res(500, str(e))
