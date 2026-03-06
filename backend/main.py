import os
import json
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

# Gemini Configuration
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in environment variables.")

genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

app = FastAPI(title="Nutrition AI API")

# Add CORS Middleware (Allow all for easier debugging)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

# Response Model
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
    """
    Receives an image, analyzes it via Gemini, and returns nutrition data.
    """
    try:
        # Read image bytes
        image_bytes = await image.read()
        
        # System Prompt
        system_prompt = (
            "당신은 전문 영양사 AI입니다. 업로드된 사진 속 음식을 인식하고, "
            "일반적인 1인분 크기를 기준으로 무게(g)를 추정한 뒤 칼로리, 탄수화물, 단백질, 지방 함량을 계산하세요. "
            "결과는 반드시 한국어 메뉴명과 함께 순수 JSON 형식으로만 응답하세요. "
            "JSON 구조: {'menu_name': str, 'weight_g': float, 'kcal': float, 'carbs_g': float, 'protein_g': float, 'fat_g': float}"
        )

        # Call Gemini (Multimodal)
        response = model.generate_content([
            system_prompt,
            {"mime_type": image.content_type, "data": image_bytes}
        ])

        # Extract JSON from response
        # Gemini often returns markdown-wrapped JSON (e.g., ```json ... ```)
        raw_text = response.text.strip()
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()

        data = json.loads(raw_text)
        
        return NutritionInfo(**data)

    except Exception as e:
        print(f"Error during analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))
