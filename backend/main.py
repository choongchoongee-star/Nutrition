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

# 로깅 설정 (INFO 레벨로 제한하여 속도 향상)
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()
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
        "version": "2.10 (Speed Optimized)",
        "key_set": bool(GOOGLE_API_KEY)
    })

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY:
        return json_res({"error": "Missing API Key"}, 500)

    try:
        content = await image.read()
        if not content:
            return json_res({"error": "Empty image"}, 400)

        # Base64 전송
        base64_image = base64.b64encode(content).decode('utf-8')
        
        # 최신 안정화된 엔드포인트 사용
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GOOGLE_API_KEY}"
        
        # 프롬프트 극단적 간소화 (응답 속도 1순위)
        # AI가 생각하는 시간을 최소화하기 위해 형식만 지정
        prompt = "Return ONLY JSON: {'menu_name':str,'weight_g':float,'kcal':float,'carbs_g':float,'protein_g':float,'fat_g':float}"
        
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
            }],
            "generationConfig": {
                "temperature": 0.1, # 일관성 및 속도 향상
                "maxOutputTokens": 200 # 짧은 응답 강제
            }
        }

        # 타임아웃을 8초로 설정 (Vercel 10초 제한 대비 안전장치)
        try:
            response = requests.post(url, json=payload, timeout=8)
        except requests.exceptions.Timeout:
            return json_res({"error": "AI analysis timed out (8s limit). Please use a smaller image."}, 504)
        
        if response.status_code != 200:
            return json_res({"error": f"API Error {response.status_code}", "detail": response.text}, 500)

        res_data = response.json()
        
        try:
            txt = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
            
            # JSON 추출 (Markdown 블록 제거)
            if "```json" in txt:
                txt = txt.split("```json")[1].split("```")[0].strip()
            elif "```" in txt:
                txt = txt.split("```")[1].split("```")[0].strip()
            
            start = txt.find('{')
            end = txt.rfind('}')
            if start == -1 or end == -1:
                return json_res({"error": "No JSON in AI response", "raw": txt}, 500)
            
            data = json.loads(txt[start:end+1])
            return json_res(data)
            
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            return json_res({"error": "AI data error", "detail": str(e), "raw_response": res_data}, 500)

    except Exception as e:
        return json_res({"error": "Server Error", "detail": str(e)}, 500)
