import os
import re
import sys
import json
import base64
import logging
from typing import Optional

import requests
import jwt as pyjwt
from jwt.algorithms import RSAAlgorithm
from fastapi import FastAPI, UploadFile, File, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


def _load_supabase_public_key():
    try:
        resp = requests.get(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", timeout=5)
        jwk = resp.json()["keys"][0]
        return RSAAlgorithm.from_jwk(json.dumps(jwk))
    except Exception as e:
        logger.error(f"Failed to load Supabase public key: {e}")
        return None

SUPABASE_PUBLIC_KEY = _load_supabase_public_key()
if SUPABASE_PUBLIC_KEY is None:
    logger.critical("SUPABASE_PUBLIC_KEY 로드 실패 — 인증 불가 상태로 시작됨")


# --- Pydantic models ---

class MealCreate(BaseModel):
    date: str
    meal_type: str
    menu_name: str
    kcal: float
    carbs_g: float
    protein_g: float
    fat_g: float
    image_uri: Optional[str] = None

class GoalsUpdate(BaseModel):
    target_kcal: float
    target_carbs: float
    target_protein: float
    target_fat: float


# --- Auth ---

async def verify_token(request: Request):
    if SUPABASE_PUBLIC_KEY is None:
        raise HTTPException(status_code=503, detail="인증 서비스를 일시적으로 사용할 수 없습니다")
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


# --- App setup ---

limiter = Limiter(key_func=get_remote_address)

def _handle_rate_limit_exceeded(_request, _exception):
    return JSONResponse(
        status_code=429,
        content={"error": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."},
    )

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _handle_rate_limit_exceeded)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://choongchoongee-star.github.io",
        "https://nutrition-choongchoongee-7456s-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

def _supabase_headers(*, content_type=None, prefer=None):
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    if content_type:
        headers["Content-Type"] = content_type
    if prefer:
        headers["Prefer"] = prefer
    return headers

def json_response(data, status=200):
    return JSONResponse(content=data, status_code=status)


# --- API ---

@app.get("/api/v1/health")
async def health():
    return json_response({"status": "ok"})


@app.get("/api/v1/meals")
async def get_meals(date: str = None, page: int = 1, limit: int = 20, _=Depends(verify_token)):
    if date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return json_response({"error": "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)"}, 400)
    headers = _supabase_headers()
    if date:
        resp = requests.get(f"{SUPABASE_URL}/rest/v1/meals?date=eq.{date}&select=*", headers=headers)
        if resp.status_code != 200:
            logger.error(f"Supabase get_meals failed [{resp.status_code}]: {resp.text}")
            return json_response({"error": "조회 실패"}, resp.status_code)
        return json_response(resp.json())

    offset = (page - 1) * limit
    count_resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/meals?select=id",
        headers=_supabase_headers(prefer="count=exact"),
    )
    total = int(count_resp.headers.get("content-range", "0/0").split("/")[-1] or 0)
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/meals?select=*&order=date.desc,id.desc&offset={offset}&limit={limit}",
        headers=headers,
    )
    if resp.status_code != 200:
        logger.error(f"Supabase get_meals (paginated) failed [{resp.status_code}]: {resp.text}")
        return json_response({"error": "조회 실패"}, resp.status_code)
    return json_response({"meals": resp.json(), "total": total, "page": page, "limit": limit})


@app.post("/api/v1/meals")
async def add_meal(meal: MealCreate, _=Depends(verify_token)):
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/meals",
        headers=_supabase_headers(content_type="application/json", prefer="return=representation"),
        json=meal.model_dump(),
    )
    if resp.status_code not in [200, 201]:
        logger.error(f"Supabase insert failed [{resp.status_code}]: {resp.text}")
        return json_response({"error": "저장 실패"}, resp.status_code)
    data = resp.json()
    return json_response(data[0] if data else meal.model_dump())


@app.get("/api/v1/goals")
async def get_goals(_=Depends(verify_token)):
    default = {"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50}
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/goals?select=*&order=id.desc&limit=1",
            headers=_supabase_headers(),
        )
        if resp.status_code != 200:
            return json_response(default)
        data = resp.json()
        if not data or not isinstance(data, list):
            return json_response(default)
        return json_response(data[0])
    except Exception as e:
        logger.error(f"get_goals error: {e}")
        return json_response(default)


@app.post("/api/v1/goals")
async def update_goals(goals: GoalsUpdate, _=Depends(verify_token)):
    payload = {"id": 1, **goals.model_dump()}
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/goals",
        headers=_supabase_headers(
            content_type="application/json",
            prefer="resolution=merge-duplicates,return=representation",
        ),
        json=payload,
    )
    if resp.status_code not in [200, 201]:
        logger.error(f"Supabase goals upsert failed [{resp.status_code}]: {resp.text}")
        return json_response({"error": "저장 실패"}, resp.status_code)
    data = resp.json()
    return json_response(data[0] if data else payload)


@app.delete("/api/v1/meals/{meal_id}")
async def delete_meal(meal_id: int, _=Depends(verify_token)):
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/meals?id=eq.{meal_id}",
        headers=_supabase_headers(),
    )
    if resp.status_code not in [200, 204]:
        logger.error(f"Supabase delete failed [{resp.status_code}]: {resp.text}")
        return json_response({"error": "삭제 실패"}, resp.status_code)
    return json_response({"success": True})


@app.post("/api/v1/analyze")
@limiter.limit("20/minute")
async def analyze(request: Request, image: UploadFile = File(...), _=Depends(verify_token)):
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        return json_response({"error": "지원하지 않는 이미지 형식입니다 (jpeg/png/webp/heic)"}, 400)
    content = await image.read()
    if len(content) > MAX_IMAGE_BYTES:
        return json_response({"error": "이미지 크기가 너무 큽니다 (최대 10MB)"}, 400)
    base64_img = base64.b64encode(content).decode("utf-8")
    prompt = "이 음식 사진을 분석하고 JSON만 반환하세요. menu_name은 반드시 한국어로: {\"menu_name\":str, \"weight_g\":float, \"kcal\":float, \"carbs_g\":float, \"protein_g\":float, \"fat_g\":float}"
    payload = {
        "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": image.content_type, "data": base64_img}}]}],
        "generationConfig": {"temperature": 0.1},
    }
    resp = requests.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        headers={"x-goog-api-key": GOOGLE_API_KEY, "Content-Type": "application/json"},
        json=payload,
    )
    try:
        response_body = resp.json()
        txt = response_body["candidates"][0]["content"]["parts"][0]["text"].strip()
        return json_response(json.loads(txt[txt.find("{"):txt.rfind("}") + 1]))
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logger.error(f"Gemini 응답 파싱 실패: {e} | status={resp.status_code} | body={resp.text[:200]}")
        return json_response({"error": "음식 분석에 실패했습니다. 다시 시도해 주세요."}, 400)
