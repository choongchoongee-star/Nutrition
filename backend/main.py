import os
import json
import traceback
import sys
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

# 즉시 로그 출력 (Render 로그에서 확인용)
print("--- Starting Nutrition AI Backend ---")
sys.stdout.flush()

# Load Environment Variables
load_dotenv()

# Gemini Configuration
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    print("CRITICAL: GOOGLE_API_KEY not found in environment variables.")
else:
    print(f"API Key exists: {GOOGLE_API_KEY[:5]}...")
sys.stdout.flush()

genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

app = FastAPI(title="Nutrition AI API")

# 1. 모든 요청 로깅 미들웨어 (가장 최상단)
@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"Incoming Request: {request.method} {request.url}")
    sys.stdout.flush()
    try:
        response = await call_next(request)
        print(f"Response Status: {response.status_code}")
        sys.stdout.flush()
        return response
    except Exception as e:
        print(f"Request Failed: {str(e)}")
        print(traceback.format_exc())
        sys.stdout.flush()
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error", "error": str(e)},
            headers={
                "Access-Control-Allow-Origin": "https://choongchoongee-star.github.io",
                "Access-Control-Allow-Credentials": "true",
            }
        )

# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://choongchoongee-star.github.io", "http://localhost:8081", "http://localhost:19006"],
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
    return {"status": "ok", "message": "Nutrition AI Backend is Running"}

@app.post("/api/v1/analyze", response_model=NutritionInfo)
async def analyze_food(image: UploadFile = File(...)):
    print(f"Analyzing food: {image.filename}, type: {image.content_type}")
    sys.stdout.flush()
    try:
        if not image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"Invalid file type: {image.content_type}")
        
        image_bytes = await image.read()
        
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
        return NutritionInfo(**data)

    except Exception as e:
        print(f"Error in /analyze: {str(e)}")
        sys.stdout.flush()
        raise e
