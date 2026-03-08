import os
import logging
import sys
import base64
import requests
from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

def json_res(data, status=200):
    return JSONResponse(content=data, status_code=status, headers={"Access-Control-Allow-Origin": "*"})

# --- 핵심 API ---

@app.get("/api/v1/health")
async def health():
    return json_res({"status": "ok", "version": "3.8 (Final Fix Attempt)"})

@app.get("/api/v1/meals")
async def get_meals(date: str):
    url = f"{SUPABASE_URL}/rest/v1/meals?date=eq.{date}&select=*"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        return json_res({"error": "조회 실패", "msg": resp.text}, resp.status_code)
    return json_res(resp.json())

@app.post("/api/v1/meals")
async def add_meal(request: Request):
    body = await request.json()
    url = f"{SUPABASE_URL}/rest/v1/meals"
    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    resp = requests.post(url, headers=headers, json=body)
    if resp.status_code not in [200, 201]:
        logger.error(f"Supabase insert failed [{resp.status_code}]: {resp.text} | body keys: {list(body.keys())}")
        return json_res({"error": "저장 실패", "msg": resp.text}, resp.status_code)
    data = resp.json()
    return json_res(data[0] if data else body)

@app.get("/api/v1/goals")
async def get_goals():
    default = {"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50}
    try:
        url = f"{SUPABASE_URL}/rest/v1/goals?select=*&order=id.desc&limit=1"
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        resp = requests.get(url, headers=headers)
        if resp.status_code != 200:
            return json_res(default)
        data = resp.json()
        if not data or not isinstance(data, list):
            return json_res(default)
        return json_res(data[0])
    except Exception as e:
        logger.error(f"get_goals error: {e}")
        return json_res(default)

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    content = await image.read()
    base64_img = base64.b64encode(content).decode('utf-8')
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
    prompt = "Return JSON: {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}"
    payload = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64_img}}]}], "generationConfig": {"temperature": 0.1}}
    resp = requests.post(url, json=payload)
    res_json = resp.json()
    txt = res_json['candidates'][0]['content']['parts'][0]['text'].strip()
    import json
    return json_res(json.loads(txt[txt.find('{'):txt.rfind('}')+1]))
