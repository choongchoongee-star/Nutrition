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

# 로깅 설정: Render.com 로그 시스템과 호환되도록 stdout으로 출력
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

logger.info("--- Starting Nutrition AI Backend (Version 2.0) ---")

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY is missing from environment variables.")

genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

app = FastAPI(title="Nutrition AI API")

# 임시로 모든 Origin 허용하여 통신 성공 여부부터 확인
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_all_requests(request: Request, call_next):
    logger.info(f"REQUEST: {request.method} {request.url}")
    try:
        response = await call_next(request)
        logger.info(f"RESPONSE: Status {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"INTERNAL ERROR: {str(e)}")
        logger.error(traceback.format_exc())
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

@app.get("/")
async def root():
    logger.debug("Root endpoint hit")
    return {"status": "ok", "message": "Backend is online", "key_exists": bool(GOOGLE_API_KEY)}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/api/v1/analyze", response_model=NutritionInfo)
async def analyze_food(image: UploadFile = File(...)):
    logger.info(f"Analysis requested: {image.filename}")
    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty image received")

        system_prompt = (
            "당신은 전문 영양사 AI입니다. 업로드된 사진 속 음식을 인식하고, "
            "일반적인 1인분 크기를 기준으로 무게(g)를 추정한 뒤 칼로리, 탄수화물, 단백질, 지방 함량을 계산하세요. "
            "결과는 반드시 한국어 메뉴명과 함께 순수 JSON 형식으로만 응답하세요. "
            "JSON 구조: {'menu_name': str, 'weight_g': float, 'kcal': float, 'carbs_g': float, 'protein_g': float, 'fat_g': float}"
        )

        response = model.generate_content([
            system_prompt,
            {"mime_type": image.content_type if image.content_type else "image/jpeg", "data": image_bytes}
        ])

        raw_text = response.text.strip()
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()

        data = json.loads(raw_text)
        logger.info(f"Analysis successful for: {data.get('menu_name')}")
        return NutritionInfo(**data)

    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        raise e
