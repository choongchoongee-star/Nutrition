import os
import json
import logging
import sys
from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import google.generativeai as genai
from dotenv import load_dotenv

# Vercel 로깅
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# FastAPI 앱 생성
app = FastAPI()

# Vercel/Serverless 환경에서는 CORS 미들웨어가 매우 안정적입니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 헬퍼: CORS 헤더가 포함된 JSON 응답
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
        "version": "2.5 (Vercel Edition)",
        "key_set": bool(GOOGLE_API_KEY)
    })

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY:
        return json_res({"error": "Missing GOOGLE_API_KEY"}, 500)

    try:
        content = await image.read()
        if not content:
            return json_res({"error": "Empty image data"}, 400)

        # Gemini 호출 (최대한 빠르게 분석하도록 프롬프트 간소화)
        genai.configure(api_key=GOOGLE_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Vercel 10s 제한을 위해 더 간결한 프롬프트 사용
        prompt = "음식 영양 분석 (JSON 형식): {menu_name:str, weight_g:float, kcal:float, carbs_g:float, protein_g:float, fat_g:float}"
        
        response = model.generate_content([
            prompt,
            {"mime_type": image.content_type or "image/jpeg", "data": content}
        ])

        try:
            txt = response.text
            start = txt.find('{')
            end = txt.rfind('}')
            if start == -1 or end == -1:
                return json_res({"error": "Invalid format from AI"}, 500)
            
            data = json.loads(txt[start:end+1])
            return json_res(data)
        except Exception as e:
            logger.error(f"Response error: {str(e)}")
            return json_res({"error": f"AI analysis failed: {str(e)}"}, 500)

    except Exception as e:
        logger.error(f"Global error: {str(e)}")
        return json_res({"error": str(e)}, 500)

# Vercel에서는 이 파일 자체가 핸들러가 됩니다 (uvicorn 불필요)
