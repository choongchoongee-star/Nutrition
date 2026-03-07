import os
import json
import logging
import sys
from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import google.generativeai as genai
from dotenv import load_dotenv

# 로깅
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Gemini 전역 설정 (성능 향상)
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
else:
    model = None

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def json_res(data, status=200):
    return JSONResponse(
        content=data,
        status_code=status,
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.get("/api/v1/health")
@app.get("/health")
async def health():
    return json_res({
        "status": "online",
        "version": "2.6 (Vercel Edition)",
        "key_set": bool(GOOGLE_API_KEY),
        "model_ready": model is not None
    })

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY or not model:
        return json_res({"error": "Backend API Key not configured correctly"}, 500)

    try:
        content = await image.read()
        if not content:
            return json_res({"error": "No image data received"}, 400)

        # 시스템 프롬프트 최소화 (응답 속도 향상)
        prompt = "음식 영양 분석 결과만 JSON으로 응답: {menu_name:str, weight_g:float, kcal:float, carbs_g:float, protein_g:float, fat_g:float}"
        
        # 분석 실행
        try:
            response = model.generate_content([
                prompt,
                {"mime_type": image.content_type or "image/jpeg", "data": content}
            ])
        except Exception as api_err:
            logger.error(f"Gemini API Error: {str(api_err)}")
            return json_res({"error": f"Gemini API Error: {str(api_err)}"}, 500)

        # 결과 파싱
        try:
            txt = response.text
            logger.info(f"AI Raw Response: {txt}")
            
            # JSON만 추출하는 더 강력한 정규식 대용 로직
            start = txt.find('{')
            end = txt.rfind('}')
            if start == -1 or end == -1:
                return json_res({"error": f"AI did not return JSON format. Raw: {txt[:50]}..."}, 500)
            
            json_str = txt[start:end+1]
            data = json.loads(json_str)
            return json_res(data)
        except Exception as parse_err:
            logger.error(f"Parse Error: {str(parse_err)}")
            return json_res({"error": f"AI Response Parse Error: {str(parse_err)}"}, 500)

    except Exception as global_err:
        logger.error(f"Global Analyze Error: {str(global_err)}")
        return json_res({"error": f"Server processing error: {str(global_err)}"}, 500)
