import AsyncStorage from '@react-native-async-storage/async-storage';

const MEALS_KEY = '@nutrition_meals';
const GOALS_KEY = '@nutrition_goals';

export const initDatabase = async () => {
  const goals = await AsyncStorage.getItem(GOALS_KEY);
  if (!goals) {
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify({
      target_kcal: 2000,
      target_carbs: 250,
      target_protein: 60,
      target_fat: 50
    }));
  }
  console.log("Web database (AsyncStorage) initialized");
};

export const getGoals = async () => {
  const goals = await AsyncStorage.getItem(GOALS_KEY);
  return goals ? JSON.parse(goals) : { target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 };
};

export const updateGoals = async (goals) => {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
};

export const saveMeal = async (meal) => {
  const meals = JSON.parse(await AsyncStorage.getItem(MEALS_KEY) || '[]');
  const newMeal = { ...meal, id: Date.now(), timestamp: new Date().toISOString() };
  meals.push(newMeal);
  await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(meals));
  return newMeal.id;
};

export const getMealsByDate = async (date) => {
  const meals = JSON.parse(await AsyncStorage.getItem(MEALS_KEY) || '[]');
  return meals.filter(m => m.date === date);
};

export const deleteMeal = async (id) => {
  const meals = JSON.parse(await AsyncStorage.getItem(MEALS_KEY) || '[]');
  const filtered = meals.filter(m => m.id !== id);
  await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(filtered));
};
