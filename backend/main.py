import os
import json
import traceback
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

# Gemini Configuration
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    print("CRITICAL: GOOGLE_API_KEY not found in environment variables.")

genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

app = FastAPI(title="Nutrition AI API")

# Add CORS Middleware - 구체적인 설정으로 변경
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://choongchoongee-star.github.io", "http://localhost:8081", "http://localhost:19006"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 글로벌 에러 핸들러 추가: 500 에러 발생 시에도 CORS 헤더를 보장함
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = traceback.format_exc()
    print(f"Unhandled Exception: {error_msg}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": error_msg},
        headers={
            "Access-Control-Allow-Origin": "https://choongchoongee-star.github.io",
            "Access-Control-Allow-Credentials": "true",
        }
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
    return {"status": "ok", "message": "Nutrition AI Backend is Running", "api_key_set": bool(GOOGLE_API_KEY)}

@app.post("/api/v1/analyze", response_model=NutritionInfo)
async def analyze_food(image: UploadFile = File(...)):
    try:
        # 1. 파일 검증
        if not image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"Invalid file type: {image.content_type}")
        
        image_bytes = await image.read()
        if len(image_bytes) == 0:
            raise HTTPException(status_code=400, detail="Empty image file.")

        # 2. 시스템 프롬프트
        system_prompt = (
            "당신은 전문 영양사 AI입니다. 업로드된 사진 속 음식을 인식하고, "
            "일반적인 1인분 크기를 기준으로 무게(g)를 추정한 뒤 칼로리, 탄수화물, 단백질, 지방 함량을 계산하세요. "
            "결과는 반드시 한국어 메뉴명과 함께 순수 JSON 형식으로만 응답하세요. "
            "JSON 구조: {'menu_name': str, 'weight_g': float, 'kcal': float, 'carbs_g': float, 'protein_g': float, 'fat_g': float}"
        )

        # 3. Gemini 호출
        response = model.generate_content([
            system_prompt,
            {"mime_type": image.content_type if image.content_type else "image/jpeg", "data": image_bytes}
        ])

        if not response.text:
            raise HTTPException(status_code=500, detail="AI returned an empty response.")

        # 4. JSON 추출 및 파싱
        raw_text = response.text.strip()
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()

        try:
            data = json.loads(raw_text)
            return NutritionInfo(**data)
        except json.JSONDecodeError:
            print(f"Failed to parse AI response: {raw_text}")
            raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {raw_text[:100]}")

    except Exception as e:
        print(f"Error during analysis: {traceback.format_exc()}")
        # 위에서 정의한 글로벌 핸들러가 처리하도록 에러를 던짐
        raise e
