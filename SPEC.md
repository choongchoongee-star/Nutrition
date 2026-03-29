# Nutrition (AI 식단 일기) — 기획서

> 마지막 업데이트: 2026-03-29
> 현재 Phase: Phase 1 완료 / Phase 2 완료

---

## 1. Overview

- **목적:** 음식 사진 촬영 → Gemini AI 자동 분석 → 칼로리/영양소 기록 일기
- **핵심 제약사항:** React Native(Expo) 웹 빌드 GitHub Pages 배포, FastAPI 백엔드 Render/Railway 호스팅
- **기술 스택:** React Native (Expo) + FastAPI + Google Gemini 1.5 Flash + Supabase
- **주요 사용자:** Charlie (개인 사용)

---

## 2. 아키텍처

### 폴더 구조
```
Nutrition/
├── frontend/          # React Native / Expo 앱
│   ├── app/           # 화면 컴포넌트
│   ├── .gitignore     # .env 모든 변형 제외
│   └── ...
├── backend/
│   ├── main.py        # FastAPI 앱 (Docker)
│   ├── Dockerfile
│   └── requirements.txt
└── docs/              # (삭제 예정 → 이 파일로 통합)
    ├── spec-core.md
    ├── spec-api.md
    └── spec-ui.md
```

### 핵심 데이터 흐름
```
사용자 사진 촬영 (expo-image-picker)
  → 이미지 메타데이터 자동 추출 (날짜/시간 → 식사 타입 제안)
  → POST /api/v1/analyze (multipart)
  → FastAPI → Gemini 1.5 Flash 분석
  → JSON 응답 (메뉴명, 칼로리, 탄단지)
  → 사용자 확인 후 Supabase DB 저장
```

### 외부 의존성
- Google Gemini 2.5 Flash API (`.env` — `GOOGLE_API_KEY` 또는 `GEMINI_API_KEY`)
- Supabase (PostgreSQL REST API)
- Render 또는 Railway (FastAPI 호스팅)
- GitHub Actions (GitHub Pages 프론트엔드 자동 배포)

---

## 3. 데이터 모델

### meals (Supabase)
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | INTEGER | PK (Autoincrement) |
| `date` | TEXT | YYYY-MM-DD |
| `meal_type` | TEXT | Breakfast / Lunch / Dinner / Snack |
| `menu_name` | TEXT | AI가 인식한 음식명 (한국어) |
| `kcal` | REAL | 칼로리 |
| `carbs_g` | REAL | 탄수화물 (g) |
| `protein_g` | REAL | 단백질 (g) |
| `fat_g` | REAL | 지방 (g) |
| `image_uri` | TEXT | 이미지 로컬 경로 |
| `timestamp` | DATETIME | 삽입 시각 |

### goals (Supabase)
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | INTEGER | PK (고정값 1) |
| `target_kcal` | REAL | 일일 칼로리 목표 |
| `target_carbs` | REAL | 탄수화물 목표 (g) |
| `target_protein` | REAL | 단백질 목표 (g) |
| `target_fat` | REAL | 지방 목표 (g) |

---

## 4. 기능 명세

### 4.1 AI 분석 워크플로우
1. 사진 촬영 또는 갤러리 선택 (EXIF 메타데이터 자동 추출)
2. 날짜·식사 타입 자동 제안 (수정 가능)
3. `POST /api/v1/analyze` → Gemini 분석
4. 결과 카드 표시 (메뉴명, 칼로리, 탄단지)
5. 확인 → Supabase 저장
- **구현 상태:** ✅ 완료

### 4.2 홈 화면 (진행률 대시보드)
- 오늘 날짜 표시
- kcal / 탄수화물 / 단백질 / 지방 vs 목표 ProgressBar
- 사진 촬영 / 갤러리 버튼
- **구현 상태:** ✅ 완료

### 4.3 히스토리 화면
- `react-native-calendars` 달력 기반 날짜 선택
- 선택 날짜 식사 기록 FlatList
- 기록 삭제 (확인 후)
- **구현 상태:** ✅ 완료

### 4.4 설정 화면
- 일일 목표 입력 (kcal, 탄단지 수치)
- **구현 상태:** ✅ 완료

### 4.5 사용자 인증
- Supabase Auth (Google OAuth) 로그인
- 백엔드 JWT 검증 (RS256, Supabase JWKS 기반) — 모든 API 엔드포인트에 적용
- **구현 상태:** ✅ 완료

---

## 5. API 명세

모든 엔드포인트는 `Authorization: Bearer <jwt>` 헤더 필수 (`/health` 제외).
Rate limit: `/api/v1/analyze` — IP당 20req/min.

| Method | Endpoint | 설명 | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/api/v1/health` | 헬스체크 | — | `{ status: "ok" }` |
| GET | `/api/v1/meals` | 식사 기록 조회 | `?date=YYYY-MM-DD` 또는 `?page=&limit=` | meals 배열 또는 페이지네이션 객체 |
| POST | `/api/v1/meals` | 식사 기록 저장 | `{ date, meal_type, menu_name, kcal, carbs_g, protein_g, fat_g }` | 저장된 레코드 |
| DELETE | `/api/v1/meals/{id}` | 식사 기록 삭제 | — | `{ success: true }` |
| GET | `/api/v1/goals` | 목표 조회 | — | `{ target_kcal, target_carbs, target_protein, target_fat }` |
| POST | `/api/v1/goals` | 목표 저장 | `{ target_kcal, target_carbs, target_protein, target_fat }` | 저장된 레코드 |
| POST | `/api/v1/analyze` | 음식 사진 AI 분석 | multipart image (jpeg/png/webp/heic, 최대 10MB) | `{ menu_name, weight_g, kcal, carbs_g, protein_g, fat_g }` |

### 백엔드 의존성
- `fastapi`, `uvicorn`, `gunicorn`
- `requests`, `pydantic`, `python-dotenv`
- `slowapi` (rate limiting)
- `PyJWT[crypto]` (RS256 JWT 검증)
- `python-multipart` (파일 업로드)

---

## 6. Phase 계획

### ✅ Phase 1 — MVP (완료)
- [x] AI 분석 워크플로우 (사진 → Gemini → 저장)
- [x] 홈 진행률 대시보드
- [x] 히스토리 달력 화면
- [x] 설정 (목표 입력)
- [x] Supabase 클라우드 DB 연동
- [x] FastAPI Docker 배포 (Render/Railway)
- [x] GitHub Actions CI/CD (GitHub Pages)
- [x] 전체 UI 한국어 현지화
- [x] 422 오류 수정 (Pydantic 타입 정렬)

### ✅ Phase 2 — 인증 (완료)
- [x] Google 로그인 (Supabase Auth)
- [x] 미인증 요청 차단 (백엔드 JWT 검증, RS256)

---

## 7. Out of Scope

- 바코드 식품 검색
- 소셜 기능
- 오프라인 모드
- 상세 영양소 분석 (비타민/미네랄)
- 복합 식사 AI 정확도 향상 (AI 모델 한계로 스코프 제외)

---

## 8. 미완료 / 알려진 이슈

- [ ] Vercel 백엔드 cold start 지연 모니터링 필요
