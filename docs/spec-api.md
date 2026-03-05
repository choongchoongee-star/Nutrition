# Specification: API (FastAPI Backend)

## 1. Endpoints Design

### 1.1. Nutrition Analysis (`POST /api/v1/analyze`)
- **Input:** Image file (Multipart)
- **Workflow:** 
    1. Upload to storage (S3/Firebase).
    2. Pass URL/Image to Gemini.
    3. Return structured JSON.
- **Output:**
    ```json
    {
      "menu_name": "Kimchi Jjigae",
      "estimated_weight": 350,
      "calories": 450.5,
      "macros": {
        "carbs": 25.0,
        "protein": 15.5,
        "fat": 30.0
      }
    }
    ```

### 1.2. Meal Logging (`POST /api/v1/meals`)
- **Input:** Confirmed nutrition data + Image URL.
- **Output:** Saved meal record ID.

### 1.3. Daily Statistics (`GET /api/v1/stats/daily`)
- **Output:** Current intake vs goals.

## 2. Gemini Prompt Engineering (Backend Side)
### System Prompt:
"You are a professional AI Dietitian. Recognize the food in the uploaded photo, estimate the weight (g) based on a typical 1-person serving size, and calculate calories, carbohydrates, protein, and fat. Result MUST be in pure JSON format with Korean menu names."

### Expected JSON Schema:
```json
{
  "menu_name": "string (Korean)",
  "weight_g": "number",
  "kcal": "number",
  "carbs_g": "number",
  "protein_g": "number",
  "fat_g": "number"
}
```

## 3. Libraries & Dependencies
- `fastapi`, `uvicorn` (Server)
- `google-generativeai` (Gemini SDK)
- `pydantic` (Data Validation)
- `sqlalchemy` or `tortoise-orm` (Database)
- `boto3` or `firebase-admin` (Storage)
