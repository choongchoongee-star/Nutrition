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

# 로깅
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()
# 두 가지 변수명 모두 지원
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

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
        "version": "2.8 (Fixed Env Check)",
        "key_set": bool(GOOGLE_API_KEY),
        "how_to_fix": "If key_set is false, add 'GOOGLE_API_KEY' in Vercel Project Settings > Environment Variables and REDEPLOY." if not GOOGLE_API_KEY else "All set!"
    })

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY:
        return json_res({"error": "API Key is missing. Please set GOOGLE_API_KEY in Vercel environment variables."}, 500)
...

    try:
        content = await image.read()
        if not content:
            return json_res({"error": "No image data"}, 400)

        # Base64 encoding for REST API
        base64_image = base64.b64encode(content).decode('utf-8')
        
        # REST API URL (Gemini 1.5 Flash)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GOOGLE_API_KEY}"
        
        headers = {'Content-Type': 'application/json'}
        
        prompt = "음식 영양 분석 (결과만 JSON으로): {menu_name:str, weight_g:float, kcal:float, carbs_g:float, protein_g:float, fat_g:float}"
        
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

        # API 호출
        response = requests.post(url, headers=headers, json=payload, timeout=25)
        
        if response.status_code != 200:
            logger.error(f"Gemini API Error: {response.text}")
            return json_res({"error": f"Gemini API returned {response.status_code}", "detail": response.json()}, 500)

        res_data = response.json()
        
        try:
            # Gemini 응답 구조에서 텍스트 추출
            txt = res_data['candidates'][0]['content']['parts'][0]['text']
            logger.info(f"AI Raw Response: {txt}")
            
            # JSON 추출
            start = txt.find('{')
            end = txt.rfind('}')
            if start == -1 or end == -1:
                return json_res({"error": "AI response format error (No JSON found)"}, 500)
            
            json_str = txt[start:end+1]
            data = json.loads(json_str)
            return json_res(data)
            
        except Exception as e:
            logger.error(f"Data Processing Error: {str(e)}")
            return json_res({"error": "Failed to parse AI response", "raw": str(res_data)}, 500)

    except Exception as e:
        logger.error(f"Global Error: {str(e)}")
        return json_res({"error": f"Server Error: {str(e)}"}, 500)
