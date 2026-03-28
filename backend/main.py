import os
import re
import logging
import sys
import base64
import requests
import jwt as pyjwt
from fastapi import FastAPI, UploadFile, File, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

import json
from jwt.algorithms import RSAAlgorithm


def _load_supabase_public_key():
    try:
        resp = requests.get(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", timeout=5)
        jwk = resp.json()["keys"][0]
        return RSAAlgorithm.from_jwk(json.dumps(jwk))
    except Exception as e:
        logger.error(f"Failed to load Supabase public key: {e}")
        return None

SUPABASE_PUBLIC_KEY = _load_supabase_public_key()


async def verify_token(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다")
    token = auth_header.split(" ")[1]
    try:
        pyjwt.decode(token, SUPABASE_PUBLIC_KEY, algorithms=["RS256"], audience="authenticated")
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="토큰이 만료됐습니다")
    except pyjwt.InvalidTokenError as e:
        logger.error(f"JWT verification failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")

app = FastAPI()

ALLOWED_ORIGINS = [
    "https://choongchoongee-star.github.io",
    "https://nutrition-choongchoongee-7456s-projects.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

def json_res(data, status=200):
    return JSONResponse(content=data, status_code=status)

# --- 핵심 API ---

@app.get("/api/v1/health")
async def health():
    return json_res({"status": "ok", "version": "3.9 (POST goals)"})

@app.get("/api/v1/meals")
async def get_meals(date: str = None, page: int = 1, limit: int = 20, _=Depends(verify_token)):
    if date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return json_res({"error": "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)"}, 400)
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    if date:
        url = f"{SUPABASE_URL}/rest/v1/meals?date=eq.{date}&select=*"
        resp = requests.get(url, headers=headers)
        if resp.status_code != 200:
            return json_res({"error": "조회 실패", "msg": resp.text}, resp.status_code)
        return json_res(resp.json())
    else:
        offset = (page - 1) * limit
        count_headers = {**headers, "Prefer": "count=exact"}
        count_resp = requests.get(f"{SUPABASE_URL}/rest/v1/meals?select=id", headers=count_headers)
        total = int(count_resp.headers.get("content-range", "0/0").split("/")[-1] or 0)
        url = f"{SUPABASE_URL}/rest/v1/meals?select=*&order=date.desc,id.desc&offset={offset}&limit={limit}"
        resp = requests.get(url, headers=headers)
        if resp.status_code != 200:
            return json_res({"error": "조회 실패", "msg": resp.text}, resp.status_code)
        return json_res({"meals": resp.json(), "total": total, "page": page, "limit": limit})

@app.post("/api/v1/meals")
async def add_meal(request: Request, _=Depends(verify_token)):
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
async def get_goals(_=Depends(verify_token)):
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

@app.post("/api/v1/goals")
async def update_goals(request: Request, _=Depends(verify_token)):
    body = await request.json()
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
    }
    payload = {"id": 1, **body}
    url = f"{SUPABASE_URL}/rest/v1/goals"
    resp = requests.post(url, headers=headers, json=payload)
    if resp.status_code not in [200, 201]:
        logger.error(f"Supabase goals upsert failed [{resp.status_code}]: {resp.text}")
        return json_res({"error": "저장 실패", "msg": resp.text}, resp.status_code)
    data = resp.json()
    return json_res(data[0] if data else payload)

@app.delete("/api/v1/meals/{meal_id}")
async def delete_meal(meal_id: int, _=Depends(verify_token)):
    url = f"{SUPABASE_URL}/rest/v1/meals?id=eq.{meal_id}"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    resp = requests.delete(url, headers=headers)
    if resp.status_code not in [200, 204]:
        logger.error(f"Supabase delete failed [{resp.status_code}]: {resp.text}")
        return json_res({"error": "삭제 실패", "msg": resp.text}, resp.status_code)
    return json_res({"success": True})

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...), _=Depends(verify_token)):
    content = await image.read()
    base64_img = base64.b64encode(content).decode('utf-8')
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
    prompt = "이 음식 사진을 분석하고 JSON만 반환하세요. menu_name은 반드시 한국어로: {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}"
    payload = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64_img}}]}], "generationConfig": {"temperature": 0.1}}
    resp = requests.post(url, json=payload)
    try:
        res_json = resp.json()
        txt = res_json['candidates'][0]['content']['parts'][0]['text'].strip()
        return json_res(json.loads(txt[txt.find('{'):txt.rfind('}')+1]))
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logger.error(f"Gemini 응답 파싱 실패: {e} | status={resp.status_code} | body={resp.text[:200]}")
        return json_res({"error": "음식 분석에 실패했습니다. 다시 시도해 주세요."}, 400)
