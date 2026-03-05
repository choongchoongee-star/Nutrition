# Specification: Core (Nutrition AI)

## 1. Project Overview
- **Project Name:** Nutrition (Working Title)
- **Objective:** An AI-powered diet diary that analyzes food photos via Gemini API to automatically log calories and macronutrients (Carbs, Protein, Fat).

## 2. High-Level Architecture
- **Mobile Frontend:** React Native (Expo)
- **Backend API:** Python (FastAPI)
- **AI Model:** Google Gemini 1.5 Flash (Primary) / Pro (Fallback/High-Precision)
- **Database:** SQLite (Initial/Local) or PostgreSQL (Production)
- **Storage:** AWS S3 or Firebase Storage for image hosting

## 3. Data Models (Initial)

### 3.1. MealLog
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| user_id | UUID | Reference to User |
| image_url | String | Path to stored image |
| menu_name | String | Identified food name (Korean) |
| estimated_weight | Float | Estimated weight in grams (g) |
| calories | Float | Energy in kcal |
| carbs | Float | Carbohydrates in grams |
| protein | Float | Protein in grams |
| fat | Float | Fat in grams |
| timestamp | DateTime | When the meal was logged |
| is_confirmed | Boolean | Whether user manually confirmed the AI result |

### 3.2. UserProfile
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| weight | Float | Current weight |
| height | Float | Height in cm |
| activity_level | Enum | Sedentary, Moderate, Active, etc. |
| target_calories | Float | Daily goal |
| target_macros | JSON | {carbs, protein, fat} goals |

## 4. Security & Integrity
- **Credential Safety:** All API Keys (Gemini, AWS) must be handled via environment variables (`.env`).
- **Input Validation:** Strict validation of image formats and metadata.
- **Privacy:** Images should be handled securely according to user preference.
