# GEMINI.md - Nutrition (AI Diet Diary)

## Project Status
- **Current Phase:** Cloud Deployment & CI/CD Setup
- **Next Milestone:** Live Backend Deployment & Production Testing
- **Last Updated:** 2026-03-07

## Tech Stack
- **Frontend:** React Native / Expo (GitHub Pages for Web)
- **Backend:** FastAPI (Dockerized for Render/Railway)
- **AI Model:** Google Gemini 1.5 Flash
- **CI/CD:** GitHub Actions (Auto-deploy to GitHub Pages)

## Recent Progress (Last 5 Logs)
- **2026-03-07:** Implemented nutrient goal setting and real-time progress visualization dashboard.
- **2026-03-07:** Implemented local SQLite database for meal history storage.
- **2026-03-07:** Added Calendar-based history view with daily meal summaries.
- **2026-03-07:** Integrated image metadata extraction (EXIF) to auto-suggest meal date and type.
- **2026-03-05:** Configured GitHub Actions for automatic Expo Web deployment to GitHub Pages.

## Upcoming Tasks
- [ ] Deploy backend to **Render.com** or **Railway**.
- [ ] Update `frontend/src/screens/HomeScreen.js` with the live production API URL.
- [ ] Configure GitHub Pages settings to use the `gh-pages` branch.
- [ ] Implement user authentication and cloud sync (Firebase/PostgreSQL).
