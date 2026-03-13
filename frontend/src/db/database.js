import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('nutrition.db');

export const initDatabase = async () => {
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
  try {
    const row = await db.getFirstAsync(`SELECT * FROM goals WHERE id = 1`);
    return row;
  } catch (error) {
    console.error("Failed to get goals:", error);
    return { target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 };
  }
};

export const updateGoals = async (goals) => {
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
  try {
    await db.runAsync(`DELETE FROM meals WHERE id = ?`, [id]);
  } catch (error) {
    console.error("Failed to delete meal:", error);
  }
};

export const getAllMeals = async (page = 1, limit = 20) => {
  try {
    const offset = (page - 1) * limit;
    const countResult = await db.getFirstAsync(`SELECT COUNT(*) as total FROM meals`);
    const total = countResult.total;
    const rows = await db.getAllAsync(
      `SELECT * FROM meals ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return { meals: rows, total, page, limit };
  } catch (error) {
    console.error("Failed to get all meals:", error);
    return { meals: [], total: 0, page: 1, limit: 20 };
  }
};
