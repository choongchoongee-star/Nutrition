# Specification: UI (React Native / Expo)

## 1. Screens & UX

### 1.1. Home / Dashboard
- **Feature:** Visual representation of daily intake (Carbs/Protein/Fat/Calories).
- **Component:** Circular progress charts or stacked bars vs targets.
- **Action:** Primary "Add Meal" button (Floating Action Button).

### 1.2. Camera / Upload
- **Feature:** Integrated camera view and gallery picker.
- **Workflow:** Capture/Select -> Loading State (Analyzing...) -> Analysis Results.

### 1.3. Analysis Confirmation
- **Feature:** Display AI's estimated menu name, weight, and nutrients.
- **Action:** Editable fields for correction, "Confirm & Log" button.

### 1.4. History / Timeline
- **Feature:** Scrollable list of past meals with photos and summary.
- **Action:** Tap to view details or edit.

### 1.5. Profile / Settings
- **Feature:** User's weight, height, activity level, and target goals.

## 2. UI/UX Principles
- **Clarity:** Large, easy-to-read nutrient numbers.
- **Feedback:** Clear "Analyzing" spinner for long-running AI tasks.
- **Ease of Use:** Minimize taps from camera capture to log confirmation.

## 3. Tech Stack Components
- `expo-camera`, `expo-image-picker` (Capture)
- `react-navigation` (Routing)
- `react-native-chart-kit` or `victory-native` (Dashboard Visuals)
- `lucide-react-native` (Icons)
- `axios` (API requests)
