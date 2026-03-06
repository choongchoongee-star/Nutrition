# Specification: UI (React Native / Expo)

## 1. Screens & UX

### 1.1. Home Screen
- **Feature:** Real-time progress dashboard.
- **Component:** `ProgressBar` visualization for kcal, carbs, protein, and fat vs daily goals.
- **Action:** Gallery picker / Camera buttons, "Start AI Analysis" button.

### 1.2. History Screen
- **Feature:** Calendar-based meal logs.
- **Component:** `react-native-calendars` for date selection, `FlatList` for meal records.
- **Action:** Tap date to view logs, delete logs with confirmation.

### 1.3. Settings Screen
- **Feature:** Manage daily nutrient goals.
- **Action:** Numeric input for kcal, carbs, protein, fat targets.

### 1.4. Analysis Workflow
1. **Pick/Take Photo:** Automatic metadata extraction (Date/Time).
2. **Auto-Suggest:** Sets meal date and type (Breakfast/Lunch/Dinner/Snack) based on photo info.
3. **AI Analysis:** Calls backend, displays result card.
4. **Confirm & Log:** Saves to local SQLite database.

## 2. Tech Stack Components
- `expo-image-picker`, `expo-media-library` (Capture & Metadata)
- `@react-navigation/native-stack` (Navigation)
- `expo-sqlite` (Local Storage)
- `react-native-calendars` (History UI)
- `lucide-react-native` (Icons)
- `axios` (API requests)
