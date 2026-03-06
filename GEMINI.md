# GEMINI.md - Nutrition (AI Diet Diary)

## Project Status
- **Current Phase:** Cloud Deployment & CI/CD Setup
- **Next Milestone:** Production Testing & UX Polish
- **Last Updated:** 2026-03-07

## Tech Stack
- **Frontend:** React Native / Expo (GitHub Pages for Web)
- **Backend:** FastAPI (Dockerized for Render/Railway)
- **AI Model:** Google Gemini 1.5 Flash
- **CI/CD:** GitHub Actions (Auto-deploy to GitHub Pages)

## Recent Progress (Last 5 Logs)
- **2026-03-07:** Implemented Bottom Tab Navigation for better UX between Home, History, and Settings.
- **2026-03-07:** Fixed Backend CORS and Frontend Web Blob handling to resolve 422 errors on web.
- **2026-03-07:** Resolved `expo-image-picker` deprecation warnings and improved platform-specific file handling.
- **2026-03-07:** Added nutrient goal setting and real-time progress visualization dashboard.
- **2026-03-07:** Implemented local SQLite/AsyncStorage persistence with platform-specific fallbacks.

## Upcoming Tasks
- [ ] Monitor Render.com backend stability.
- [ ] Implement user authentication and cloud sync (Firebase/PostgreSQL).
- [ ] Add more detailed nutrient breakdown (Vitamins/Minerals).
- [ ] Enhance AI prompt for better accuracy on complex mixed meals.
