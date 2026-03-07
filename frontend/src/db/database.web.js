import AsyncStorage from '@react-native-async-storage/async-storage';

const MEALS_KEY = '@nutrition_meals';
const GOALS_KEY = '@nutrition_goals';

export const initDatabase = async () => {
  try {
    const goals = await AsyncStorage.getItem(GOALS_KEY);
    if (!goals) {
      await AsyncStorage.setItem(GOALS_KEY, JSON.stringify({
        target_kcal: 2000,
        target_carbs: 250,
        target_protein: 60,
        target_fat: 50
      }));
    }
    
    // 용량 관리: 기존 데이터 중에 너무 큰 이미지가 포함된 항목이 있는지 확인 (자가 치유 로직)
    const mealsStr = await AsyncStorage.getItem(MEALS_KEY);
    if (mealsStr && mealsStr.length > 4 * 1024 * 1024) { // 4MB 초과 시
      console.warn("Storage usage high, cleaning up images...");
      const meals = JSON.parse(mealsStr);
      const cleanedMeals = meals.map(m => ({ ...m, image_uri: null }));
      await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(cleanedMeals));
    }
    
    console.log("Web database (AsyncStorage) initialized and optimized");
  } catch (e) {
    console.error("Database init error:", e);
  }
};

export const getGoals = async () => {
  const goals = await AsyncStorage.getItem(GOALS_KEY);
  return goals ? JSON.parse(goals) : { target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 };
};

export const updateGoals = async (goals) => {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
};

export const saveMeal = async (meal) => {
  try {
    const meals = JSON.parse(await AsyncStorage.getItem(MEALS_KEY) || '[]');
    
    // 용량 최적화: 이미지 데이터가 너무 크면 저장하지 않거나 압축된 형태만 저장
    // 웹 localStorage는 약 5MB 제한이 있으므로 Base64 이미지를 저장하면 안 됨
    const { image_uri, ...textData } = meal;
    
    // 만약 이미지가 data:로 시작하는 Base64라면 제거하고 저장
    const finalMeal = { 
      ...textData, 
      id: Date.now(), 
      timestamp: new Date().toISOString(),
      // 썸네일 압축 이미지를 허용하도록 길이 제한을 10만 자(약 75KB)로 늘림
      image_uri: (image_uri && image_uri.length < 100000) ? image_uri : null 
    };
    
    meals.push(finalMeal);
    await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(meals));
    return finalMeal.id;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      throw new Error("저장 공간이 부족합니다. 이전 기록을 삭제하거나 브라우저 캐시를 비워주세요.");
    }
    throw error;
  }
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
