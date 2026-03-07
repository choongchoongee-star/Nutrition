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
from starlette.middleware.base import BaseHTTPMiddleware

# 로깅 설정: Render.com 로그 시스템과 호환되도록 stdout으로 출력
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

logger.info("--- Starting Nutrition AI Backend (Version 2.1) ---")

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY is missing from environment variables.")

genai.configure(api_key=GOOGLE_API_KEY)
# Safety settings to prevent excessive blocking
safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]
model = genai.GenerativeModel('gemini-1.5-flash', safety_settings=safety_settings)

app = FastAPI(title="Nutrition AI API")

# Custom Middleware for Logging and Error Handling
class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger.info(f"REQUEST: {request.method} {request.url}")
        try:
            response = await call_next(request)
            logger.info(f"RESPONSE: Status {response.status_code}")
            return response
        except Exception as e:
            logger.error(f"UNHANDLED INTERNAL ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal Server Error", 
                    "detail": str(e),
                    "traceback": traceback.format_exc() if os.getenv("DEBUG") == "True" else "Check server logs"
                }
            )

# Order matters: CORSMiddleware should be outermost (last added)
# so it can process even the error responses from our middleware.
app.add_middleware(ErrorHandlingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return {
        "status": "ok", 
        "message": "Backend is online (v2.1)", 
        "key_exists": bool(GOOGLE_API_KEY),
        "env": os.getenv("ENVIRONMENT", "unknown")
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/api/v1/analyze", response_model=NutritionInfo)
async def analyze_food(image: UploadFile = File(...)):
    logger.info(f"Analysis requested: {image.filename}, content_type: {image.content_type}")
    
    if not GOOGLE_API_KEY:
        logger.error("Attempted analysis without GOOGLE_API_KEY")
        raise HTTPException(status_code=500, detail="Gemini API Key is not configured on the server.")

    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty image received")

        logger.info(f"Image size: {len(image_bytes)} bytes")

        system_prompt = (
            "당신은 전문 영양사 AI입니다. 업로드된 사진 속 음식을 인식하고, "
            "일반적인 1인분 크기를 기준으로 무게(g)를 추정한 뒤 칼로리, 탄수화물, 단백질, 지방 함량을 계산하세요. "
            "결과는 반드시 한국어 메뉴명과 함께 순수 JSON 형식으로만 응답하세요. "
            "절대로 설명이나 다른 텍스트를 포함하지 마세요. "
            "JSON 구조: {'menu_name': str, 'weight_g': float, 'kcal': float, 'carbs_g': float, 'protein_g': float, 'fat_g': float}"
        )

        mime_type = image.content_type if image.content_type else "image/jpeg"
        
        # Call Gemini
        response = model.generate_content([
            system_prompt,
            {"mime_type": mime_type, "data": image_bytes}
        ])

        # Safely handle response text
        try:
            raw_text = response.text.strip()
        except Exception as block_err:
            logger.error(f"Gemini response was blocked or empty: {str(block_err)}")
            if hasattr(response, 'prompt_feedback'):
                logger.error(f"Prompt feedback: {response.prompt_feedback}")
            raise HTTPException(status_code=500, detail=f"AI response was blocked by safety filters or failed. {str(block_err)}")

        logger.debug(f"Raw AI Response: {raw_text}")

        # JSON Extraction
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()
        
        # Remove any leading/trailing characters that aren't { or }
        start_idx = raw_text.find('{')
        end_idx = raw_text.rfind('}')
        if start_idx != -1 and end_idx != -1:
            raw_text = raw_text[start_idx:end_idx+1]

        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError as je:
            logger.error(f"JSON Parsing failed: {str(je)} | Raw: {raw_text}")
            raise HTTPException(status_code=500, detail="Failed to parse AI response as JSON.")

        # Ensure all keys exist
        required_keys = ['menu_name', 'weight_g', 'kcal', 'carbs_g', 'protein_g', 'fat_g']
        for key in required_keys:
            if key not in data:
                # Provide a fallback or raise error
                logger.warning(f"Missing key in AI response: {key}")
                data[key] = 0 if key != 'menu_name' else "Unknown"

        logger.info(f"Analysis successful for: {data.get('menu_name')}")
        return NutritionInfo(**data)

    except HTTPException as he:
        # Re-raise HTTPExceptions as they are intended
        raise he
    except Exception as e:
        logger.error(f"Analysis failed with unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
