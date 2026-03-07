# GEMINI.md - Nutrition (AI Diet Diary)

## Project Status
- **Current Phase:** Cloud Deployment & CI/CD Setup
- **Next Milestone:** Production Stability & UI Polish
- **Last Updated:** 2026-03-07

## Tech Stack
- **Frontend:** React Native / Expo (GitHub Pages for Web)
- **Backend:** FastAPI (Dockerized for Render/Railway)
- **AI Model:** Google Gemini 1.5 Flash
- **CI/CD:** GitHub Actions (Auto-deploy to GitHub Pages)

## Recent Progress (Last 5 Logs)
- **2026-03-07:** Conducted security audit. No hardcoded keys found. Improved `frontend/.gitignore` to strictly exclude all `.env` variants.
- **2026-03-07:** Fixed critical syntax error in `main.py` (v2.9) that caused Vercel function crash. Restored full REST API logic.
- **2026-03-07:** Resolved `QuotaExceededError` (v1.2.0) by excluding large image data from `AsyncStorage` on the web. Implemented auto-cleanup logic for existing bloated records.
- **2026-03-07:** Fixed "Confirm & Log" button unresponsiveness (v1.1.9) by adding detailed error handling and ensuring numeric data types for storage.
- **2026-03-07:** Successfully received AI responses and implemented Robust JSON Extraction (v1.1.8) to handle conversational or markdown-formatted API replies.
- **2026-03-07:** Switched to `gemini-2.5-flash` and implemented On-Screen Error Monitoring (v1.1.6). This will display raw API responses directly on the UI for easier debugging.
- **2026-03-07:** Switched to stable `v1` Gemini API endpoint (v1.1.2) to resolve 404 errors. Improved error reporting to show server-side reason.
- **2026-03-07:** Fixed UI button unresponsiveness by correcting undefined styles. Updated GitHub Actions (`deploy.yml`) to properly inject `EXPO_PUBLIC_GOOGLE_API_KEY` during build.
- **2026-03-07:** Migrated backend to direct REST API calls (v2.7) to fix 500 errors caused by heavy library initialization in Vercel. Added detailed error reporting in v1.0.6.
- **2026-03-07:** Migrating backend to Vercel (v2.5) to fix persistent CORS/404 issues on Render. Added `vercel.json` and optimized for serverless.
- **2026-03-07:** Upgraded to Backend v2.3 & Frontend v1.0.2. Added redundant `/health` and `/api/v1/health` paths and reinforced CORS headers for 404/500 scenarios.
- **2026-03-07:** Unified API paths to `/api/v1/` and forced CORS headers on all responses (including 404/500) to fix intermittent browser blocks.
- **2026-03-07:** Implemented anti-timeout measures: server wake-up ping, 90s axios timeout, and square cropping (0.6 quality) to reduce payload.
- **2026-03-07:** Resolved recurring CORS and 500 errors by making `CORSMiddleware` outermost and reducing frontend image payload quality (0.7).
- **2026-03-07:** Fixed Render.com backend connectivity by implementing dynamic `$PORT` handling in Dockerfile.
- **2026-03-07:** Improved UX with Bottom Tab Navigation and fixed broken calendar assets with Lucide icons.
- **2026-03-07:** Isolated native modules via `.web.js` extensions to resolve web-build crashes (`ExpoSQLite`).
- **2026-03-07:** Implemented dual-storage persistence (SQLite/AsyncStorage) for logs and nutrient goals.

## Upcoming Tasks
- [ ] Monitor Render.com backend stability and logs.
- [ ] Implement user authentication and cloud sync (Firebase/PostgreSQL).
- [ ] Add more detailed nutrient breakdown (Vitamins/Minerals).
- [ ] Enhance AI prompt for better accuracy on complex mixed meals.
