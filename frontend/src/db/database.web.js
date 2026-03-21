import axios from 'axios';
import { supabase } from '../lib/supabase';

// 백엔드 API 주소 (Vercel)
const API_BASE_URL = "https://nutrition-choongchoongee-7456s-projects.vercel.app/api/v1";

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
};

export const initDatabase = async () => {
  console.log("Cloud Database (Supabase via Vercel) initialized");
};

export const getGoals = async () => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/goals`, { headers });
    return response.data;
  } catch (e) {
    console.error("Failed to fetch goals:", e);
    return { target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 };
  }
};

export const updateGoals = async (goals) => {
  try {
    const headers = await getAuthHeaders();
    await axios.post(`${API_BASE_URL}/goals`, goals, { headers });
  } catch (e) {
    console.error("Failed to update goals:", e);
  }
};

export const saveMeal = async (meal) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/meals`, meal, { headers });
    return response.data.id;
  } catch (e) {
    console.error("Failed to save meal to cloud:", e);
    throw new Error(e.response?.data?.detail || "Cloud save failed");
  }
};

export const getMealsByDate = async (date) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/meals?date=${date}`, { headers });
    return response.data;
  } catch (e) {
    console.error("Failed to fetch meals:", e);
    return [];
  }
};

export const deleteMeal = async (id) => {
  try {
    const headers = await getAuthHeaders();
    await axios.delete(`${API_BASE_URL}/meals/${id}`, { headers });
  } catch (e) {
    console.error("Failed to delete meal:", e);
  }
};

export const getAllMeals = async (page = 1, limit = 20) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/meals?page=${page}&limit=${limit}`, { headers });
    return response.data;
  } catch (e) {
    console.error("Failed to fetch all meals:", e);
    return { meals: [], total: 0, page: 1, limit: 20 };
  }
};
