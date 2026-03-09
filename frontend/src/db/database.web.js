import axios from 'axios';

// 백엔드 API 주소 (Vercel)
const API_BASE_URL = "https://nutrition-choongchoongee-7456s-projects.vercel.app/api/v1";

export const initDatabase = async () => {
  console.log("Cloud Database (Supabase via Vercel) initialized");
};

export const getGoals = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/goals`);
    return response.data;
  } catch (e) {
    console.error("Failed to fetch goals:", e);
    return { target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 };
  }
};

export const updateGoals = async (goals) => {
  try {
    await axios.post(`${API_BASE_URL}/goals`, goals);
  } catch (e) {
    console.error("Failed to update goals:", e);
    throw e;
  }
};

export const saveMeal = async (meal) => {
  try {
    // 썸네일 처리 로직은 HomeScreen에서 수행되므로 여기선 전달만 함
    const response = await axios.post(`${API_BASE_URL}/meals`, meal);
    return response.data.id;
  } catch (e) {
    console.error("Failed to save meal to cloud:", e);
    throw new Error(e.response?.data?.detail || "Cloud save failed");
  }
};

export const getMealsByDate = async (date) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/meals?date=${date}`);
    return response.data;
  } catch (e) {
    console.error("Failed to fetch meals:", e);
    return [];
  }
};

export const deleteMeal = async (id) => {
  try {
    await axios.delete(`${API_BASE_URL}/meals/${id}`);
  } catch (e) {
    console.error("Failed to delete meal:", e);
  }
};
