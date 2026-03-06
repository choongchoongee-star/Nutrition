# Specification: Core (Nutrition AI)

## 1. Project Overview
- **Project Name:** Nutrition (Working Title)
- **Objective:** An AI-powered diet diary that analyzes food photos via Gemini API to automatically log calories and macronutrients (Carbs, Protein, Fat).

## 2. High-Level Architecture
- **Mobile Frontend:** React Native (Expo)
- **Backend API:** Python (FastAPI)
- **AI Model:** Google Gemini 1.5 Flash (Primary)
- **Database:** SQLite (Initial/Local) via `expo-sqlite`
- **Storage:** Local URI for images (Initial); Cloud storage (Planned)

## 3. Data Models (Implemented)

### 3.1. meals (SQLite)
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Primary Key (Autoincrement) |
| date | TEXT | YYYY-MM-DD format |
| meal_type | TEXT | Breakfast, Lunch, Dinner, Snack |
| menu_name | TEXT | Identified food name (Korean) |
| kcal | REAL | Energy in kcal |
| carbs_g | REAL | Carbohydrates in grams |
| protein_g | REAL | Protein in grams |
| fat_g | REAL | Fat in grams |
| image_uri | TEXT | Local path to image |
| timestamp | DATETIME | Insertion timestamp |

### 3.2. goals (SQLite)
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Primary Key (Fixed to 1) |
| target_kcal | REAL | Daily calorie goal |
| target_carbs | REAL | Daily carbs goal (g) |
| target_protein | REAL | Daily protein goal (g) |
| target_fat | REAL | Daily fat goal (g) |

## 4. Security & Integrity
- **Credential Safety:** API Keys handled via environment variables.
- **Input Validation:** Image metadata (EXIF) extraction for auto-suggesting meal dates.
