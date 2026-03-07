import os
import json
import logging
import sys
import base64
import requests
from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from supabase import create_client, Client

# Logging configuration
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

load_dotenv()

# Config
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Initialize Supabase Client
supabase: Client = None
try:
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully")
    else:
        logger.warning(f"Supabase credentials missing: URL={bool(SUPABASE_URL)}, KEY={bool(SUPABASE_KEY)}")
except Exception as e:
    logger.error(f"Failed to init Supabase: {str(e)}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Meal(BaseModel):
    id: Optional[int] = None
    date: str
    meal_type: str
    menu_name: str
    kcal: float
    carbs_g: float
    protein_g: float
    fat_g: float
    image_uri: Optional[str] = None
    timestamp: Optional[str] = None

class Goal(BaseModel):
    target_kcal: float
    target_carbs: float
    target_protein: float
    target_fat: float

def json_res(data, status=200):
    return JSONResponse(content=data, status_code=status, headers={"Access-Control-Allow-Origin": "*"})

@app.get("/api/v1/health")
@app.get("/health")
async def health():
    return json_res({
        "status": "online",
        "version": "3.1 (DB Debug Mode)",
        "gemini_ready": bool(GOOGLE_API_KEY),
        "db_ready": supabase is not None,
        "env_check": {
            "SUPABASE_URL": bool(SUPABASE_URL),
            "SUPABASE_KEY": bool(SUPABASE_KEY)
        }
    })

@app.post("/api/v1/analyze")
async def analyze(image: UploadFile = File(...)):
    if not GOOGLE_API_KEY:
        return json_res({"error": "Missing API Key"}, 500)
    try:
        content = await image.read()
        base64_image = base64.b64encode(content).decode('utf-8')
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}"
        prompt = "Return ONLY JSON: {'menu_name':str,'weight_g':float,'kcal':float,'carbs_g':float,'protein_g':float,'fat_g':float}"
        payload = {
            "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": image.content_type or "image/jpeg", "data": base64_image}}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 300}
        }
        response = requests.post(url, json=payload, timeout=15)
        if response.status_code != 200:
            return json_res({"error": f"AI Error {response.status_code}", "detail": response.text}, 500)
        txt = response.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        start = txt.find('{')
        end = txt.rfind('}') + 1
        return json_res(json.loads(txt[start:end]))
    except Exception as e:
        return json_res({"error": str(e)}, 500)

@app.get("/api/v1/meals", response_model=List[Meal])
async def get_meals(date: str):
    if not supabase: raise HTTPException(status_code=503, detail="DB not configured")
    response = supabase.table("meals").select("*").eq("date", date).execute()
    return response.data

@app.post("/api/v1/meals")
async def add_meal(meal: Meal):
    if not supabase: raise HTTPException(status_code=503, detail="DB not configured")
    data = meal.dict(exclude_none=True)
    response = supabase.table("meals").insert(data).execute()
    return response.data[0]

@app.delete("/api/v1/meals/{meal_id}")
async def remove_meal(meal_id: int):
    if not supabase: raise HTTPException(status_code=503, detail="DB not configured")
    supabase.table("meals").delete().eq("id", meal_id).execute()
    return {"status": "deleted"}

@app.get("/api/v1/goals", response_model=Goal)
async def get_user_goals():
    if not supabase: raise HTTPException(status_code=503, detail="DB not configured")
    response = supabase.table("goals").select("*").order("id", desc=True).limit(1).execute()
    if not response.data:
        return {"target_kcal": 2000, "target_carbs": 250, "target_protein": 60, "target_fat": 50}
    return response.data[0]

@app.post("/api/v1/goals")
async def set_user_goals(goal: Goal):
    if not supabase: raise HTTPException(status_code=503, detail="DB not configured")
    response = supabase.table("goals").insert(goal.dict()).execute()
    return response.data[0]
