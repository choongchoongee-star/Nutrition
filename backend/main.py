import os
import json
import logging
import sys
import base64
import requests
from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# 로깅 설정
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()
# GOOGLE_API_KEY 또는 GEMINI_API_KEY 모두 지원
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JSON 응답 헬퍼
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
        "version": "2.9 (Fixed Syntax)",
        "key_set": bool(GOOGLE_API_KEY),
        "how_to_fix": "If key_set is false, add 'GOOGLE_API_KEY' in Vercel Settings and REDEPLOY." if not GOOGLE_API_KEY else "All set!"
    })

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY:
        return json_res({"error": "API Key is missing. Please set GOOGLE_API_KEY in Vercel environment variables."}, 500)

    try:
        content = await image.read()
        if not content:
            return json_res({"error": "No image data"}, 400)

        # 이미지 Base64 인코딩
        base64_image = base64.b64encode(content).decode('utf-8')
        
        # Gemini 1.5 Flash REST API 엔드포인트
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GOOGLE_API_KEY}"
        
        headers = {'Content-Type': 'application/json'}
        
        prompt = "음식 영양 분석 (결과만 JSON으로 응답): {menu_name:str, weight_g:float, kcal:float, carbs_g:float, protein_g:float, fat_g:float}"
        
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": image.content_type or "image/jpeg",
                            "data": base64_image
                        }
                    }
                ]
            }]
        }

        # Gemini API 호출 (동기 방식이지만 Vercel 서버리스에서는 문제 없음)
        response = requests.post(url, headers=headers, json=payload, timeout=25)
        
        if response.status_code != 200:
            logger.error(f"Gemini API Error: {response.text}")
            return json_res({"error": f"Gemini API returned {response.status_code}", "detail": response.text}, 500)

        res_data = response.json()
        
        try:
            # AI 응답에서 텍스트 부분 추출
            txt = res_data['candidates'][0]['content']['parts'][0]['text']
            logger.info(f"AI Raw Response: {txt}")
            
            # 텍스트 내에서 JSON 블록만 정밀 추출
            start = txt.find('{')
            end = txt.rfind('}')
            if start == -1 or end == -1:
                return json_res({"error": "AI did not return a valid JSON format", "raw_text": txt}, 500)
            
            json_str = txt[start:end+1]
            data = json.loads(json_str)
            return json_res(data)
            
        except Exception as e:
            logger.error(f"Data Processing Error: {str(e)}")
            return json_res({"error": "Failed to parse AI response", "detail": str(e)}, 500)

    except Exception as e:
        logger.error(f"Global Error: {str(e)}")
        return json_res({"error": f"Internal Server Error: {str(e)}"}, 500)
