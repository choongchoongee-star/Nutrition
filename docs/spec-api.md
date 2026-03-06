# Specification: API (FastAPI Backend)

## 1. Endpoints Design

### 1.1. Nutrition Analysis (`POST /api/v1/analyze`)
- **Input:** Image file (Multipart)
- **Workflow:** 
    1. Receives image bytes.
    2. Sends to Gemini 1.5 Flash with system prompt.
    3. Parses AI response into structured JSON.
- **Output:**
    ```json
    {
      "menu_name": "Kimchi Jjigae",
      "weight_g": 350.0,
      "kcal": 450.5,
      "carbs_g": 25.0,
      "protein_g": 15.5,
      "fat_g": 30.0
    }
    ```

## 2. Gemini Prompt Engineering
### System Prompt:
"당신은 전문 영양사 AI입니다. 업로드된 사진 속 음식을 인식하고, 일반적인 1인분 크기를 기준으로 무게(g)를 추정한 뒤 칼로리, 탄수화물, 단백질, 지방 함량을 계산하세요. 결과는 반드시 한국어 메뉴명과 함께 순수 JSON 형식으로만 응답하세요. JSON 구조: {'menu_name': str, 'weight_g': float, 'kcal': float, 'carbs_g': float, 'protein_g': float, 'fat_g': float}"

## 3. Libraries & Dependencies
- `fastapi`, `uvicorn` (Server)
- `google-generativeai` (Gemini SDK)
- `pydantic` (Data Validation)
- `python-dotenv` (Env management)
