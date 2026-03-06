import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isWeb = Platform.OS === 'web';
let db = null;

if (!isWeb) {
  try {
    db = SQLite.openDatabaseSync('nutrition.db');
  } catch (e) {
    console.error("Native SQLite not available:", e);
  }
}

// Web Fallback Keys
const MEALS_KEY = '@nutrition_meals';
const GOALS_KEY = '@nutrition_goals';

export const initDatabase = async () => {
  if (isWeb) {
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
    return;
  }

  if (!db) return;

  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS meals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        menu_name TEXT NOT NULL,
        kcal REAL NOT NULL,
        carbs_g REAL NOT NULL,
        protein_g REAL NOT NULL,
        fat_g REAL NOT NULL,
        image_uri TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        target_kcal REAL DEFAULT 2000,
        target_carbs REAL DEFAULT 250,
        target_protein REAL DEFAULT 60,
        target_fat REAL DEFAULT 50
      );
      INSERT OR IGNORE INTO goals (id, target_kcal, target_carbs, target_protein, target_fat) 
      VALUES (1, 2000, 250, 60, 50);
    `);
    console.log("Native database initialized");
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
};

export const getGoals = async () => {
  if (isWeb) {
    const goals = await AsyncStorage.getItem(GOALS_KEY);
    return goals ? JSON.parse(goals) : { target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 };
  }

  if (!db) return { target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 };

  try {
    const row = await db.getFirstAsync(`SELECT * FROM goals WHERE id = 1`);
    return row;
  } catch (error) {
    console.error("Failed to get goals:", error);
    return { target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 };
  }
};

export const updateGoals = async (goals) => {
  if (isWeb) {
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    return;
  }

  if (!db) return;

  const { target_kcal, target_carbs, target_protein, target_fat } = goals;
  try {
    await db.runAsync(
      `UPDATE goals SET target_kcal = ?, target_carbs = ?, target_protein = ?, target_fat = ? WHERE id = 1`,
      [target_kcal, target_carbs, target_protein, target_fat]
    );
  } catch (error) {
    console.error("Failed to update goals:", error);
    throw error;
  }
};

export const saveMeal = async (meal) => {
  if (isWeb) {
    const meals = JSON.parse(await AsyncStorage.getItem(MEALS_KEY) || '[]');
    const newMeal = { ...meal, id: Date.now(), timestamp: new Date().toISOString() };
    meals.push(newMeal);
    await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(meals));
    return newMeal.id;
  }

  if (!db) return null;

  const { date, meal_type, menu_name, kcal, carbs_g, protein_g, fat_g, image_uri } = meal;
  try {
    const result = await db.runAsync(
      `INSERT INTO meals (date, meal_type, menu_name, kcal, carbs_g, protein_g, fat_g, image_uri) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, meal_type, menu_name, kcal, carbs_g, protein_g, fat_g, image_uri]
    );
    return result.lastInsertRowId;
  } catch (error) {
    console.error("Failed to save meal:", error);
    throw error;
  }
};

export const getMealsByDate = async (date) => {
  if (isWeb) {
    const meals = JSON.parse(await AsyncStorage.getItem(MEALS_KEY) || '[]');
    return meals.filter(m => m.date === date);
  }

  if (!db) return [];

  try {
    const rows = await db.getAllAsync(
      `SELECT * FROM meals WHERE date = ? ORDER BY timestamp ASC`,
      [date]
    );
    return rows;
  } catch (error) {
    console.error("Failed to get meals by date:", error);
    return [];
  }
};

export const deleteMeal = async (id) => {
  if (isWeb) {
    const meals = JSON.parse(await AsyncStorage.getItem(MEALS_KEY) || '[]');
    const filtered = meals.filter(m => m.id !== id);
    await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(filtered));
    return;
  }

  if (!db) return;

  try {
    await db.runAsync(`DELETE FROM meals WHERE id = ?`, [id]);
  } catch (error) {
    console.error("Failed to delete meal:", error);
  }
};
