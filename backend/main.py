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

# 로깅 설정
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

logger.info("--- Starting Nutrition AI Backend (Version 2.2) ---")

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
genai.configure(api_key=GOOGLE_API_KEY)

# Safety settings
safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]
model = genai.GenerativeModel('gemini-1.5-flash', safety_settings=safety_settings)

app = FastAPI(title="Nutrition AI API")

# Robust CORS Configuration
# Note: In FastAPI, the LAST middleware added is the FIRST one to handle the request.
# BUT CORSMiddleware is a special case. Let's add it last to be safe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Global Exception Handler to ensure CORS headers are ALWAYS present
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"GLOBAL ERROR: {str(exc)}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"} # Manual addition for safety
    )

# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"INCOMING: {request.method} {request.url}")
    response = await call_next(request)
    logger.info(f"OUTGOING: {response.status_code}")
    # Force CORS header if missing (common in 404/500 cases)
    if "Access-Control-Allow-Origin" not in response.headers:
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response

class NutritionInfo(BaseModel):
    menu_name: str
    weight_g: float
    kcal: float
    carbs_g: float
    protein_g: float
    fat_g: float

# Group all routes under /api/v1 to avoid root path confusion and 404s
@app.get("/")
async def root():
    return {"status": "ok", "message": "Nutrition API v2.2"}

@app.get("/api/v1/health")
async def health_api():
    return {"status": "healthy", "version": "2.2"}

@app.post("/api/v1/analyze", response_model=NutritionInfo)
async def analyze_food(image: UploadFile = File(...)):
    logger.info(f"Processing: {image.filename}")
    
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key missing")

    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty image")

        system_prompt = (
            "당신은 전문 영양사 AI입니다. 사진 속 음식을 인식하고 무게, 칼로리, 탄단지 정보를 JSON으로만 응답하세요. "
            "JSON 구조: {'menu_name': str, 'weight_g': float, 'kcal': float, 'carbs_g': float, 'protein_g': float, 'fat_g': float}"
        )

        response = model.generate_content([
            system_prompt,
            {"mime_type": image.content_type or "image/jpeg", "data": image_bytes}
        ])

        try:
            raw_text = response.text.strip()
        except Exception as e:
            logger.error(f"Gemini text block: {str(e)}")
            raise HTTPException(status_code=500, detail="AI response blocked or failed")

        # JSON Extraction
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()
        
        start_idx = raw_text.find('{')
        end_idx = raw_text.rfind('}')
        if start_idx != -1 and end_idx != -1:
            raw_text = raw_text[start_idx:end_idx+1]

        data = json.loads(raw_text)
        return NutritionInfo(**data)

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
