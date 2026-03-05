import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
import google.generativeai as genai
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

# Gemini Configuration
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')

app = FastAPI(title="Nutrition AI API")

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
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    
    # Placeholder for actual Gemini Multimodal Call
    # 1. Read image bytes
    # 2. Call genai model with system prompt
    # 3. Parse JSON response
    
    return {
        "menu_name": "Pending (Gemini Key Needed)",
        "weight_g": 0.0,
        "kcal": 0.0,
        "carbs_g": 0.0,
        "protein_g": 0.0,
        "fat_g": 0.0
    }
