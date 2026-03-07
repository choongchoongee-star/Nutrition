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
