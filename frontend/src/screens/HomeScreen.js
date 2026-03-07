import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { getImageMetadata, suggestMealType, formatDate } from '../utils/metadata';
import { saveMeal, getMealsByDate, getGoals } from '../db/database';
import { Camera, Image as ImageIcon, Save } from 'lucide-react-native';
import ProgressBar from '../components/ProgressBar';
import { useFocusEffect } from '@react-navigation/native';

const API_URL = "https://nutrition-choongchoongee-7456s-projects.vercel.app/api/v1/analyze";
const HEALTH_URL = "https://nutrition-choongchoongee-7456s-projects.vercel.app/api/v1/health";

export default function HomeScreen({ navigation }) {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [serverAwake, setServerAwake] = useState(false);
  
  // Suggested metadata
  const [mealDate, setMealDate] = useState(formatDate(new Date()));
  const [mealType, setMealType] = useState(suggestMealType(new Date().getHours()));

  // Progress tracking state
  const [dailyStats, setDailyStats] = useState({ kcal: 0, carbs: 0, protein: 0, fat: 0 });
  const [goals, setGoals] = useState({ target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 });

  // Wake up the server on mount or focus
  const wakeUpServer = useCallback(async () => {
    try {
      await axios.get(HEALTH_URL, { timeout: 10000 });
      setServerAwake(true);
      console.log("Backend is awake!");
    } catch (e) {
      console.log("Server wake-up ping failed or still sleeping...");
      setServerAwake(false);
    }
  }, []);

  const loadDailyProgress = useCallback(async () => {
    const today = formatDate(new Date());
    const [meals, userGoals] = await Promise.all([
      getMealsByDate(today),
      getGoals()
    ]);
    
    if (userGoals) setGoals(userGoals);
    
    const stats = meals.reduce((acc, m) => ({
      kcal: acc.kcal + m.kcal,
      carbs: acc.carbs + m.carbs_g,
      protein: acc.protein + m.protein_g,
      fat: acc.fat + m.fat_g,
    }), { kcal: 0, carbs: 0, protein: 0, fat: 0 });
    
    setDailyStats(stats);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDailyProgress();
      wakeUpServer();
    }, [loadDailyProgress, wakeUpServer])
  );

  const handleImageSource = async (pickerResult) => {
    if (pickerResult.canceled) return;

    const asset = pickerResult.assets[0];
    setImage(asset.uri);
    setResult(null);
    
    // Proactively ping server when image is picked
    wakeUpServer();

    // Default to NOW
    const now = new Date();
    let finalDate = formatDate(now);
    let finalType = suggestMealType(now.getHours());

    // Metadata extraction
    if (asset.assetId) {
      try {
        const info = await getImageMetadata(asset.assetId);
        if (info && info.creationTime) {
          const dateObj = new Date(info.creationTime);
          finalDate = formatDate(dateObj);
          finalType = suggestMealType(dateObj.getHours());
        }
      } catch (e) {
        console.log("Metadata error:", e);
      }
    }
    
    setMealDate(finalDate);
    setMealType(finalType);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    await handleImageSource(result);
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      alert("Camera access denied!");
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    await handleImageSource(result);
  };

  const analyzeFood = async () => {
    if (!image) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    
    if (Platform.OS === 'web') {
      const response = await fetch(image);
      const blob = await response.blob();
      formData.append('image', blob, 'photo.jpg');
    } else {
      formData.append('image', {
        uri: image,
        name: 'photo.jpg',
        type: 'image/jpeg',
      });
    }

    try {
      const response = await axios.post(API_URL, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 90000, 
      });
      setResult(response.data);
    } catch (error) {
      console.error("Analysis Error Details:", error);
      let errMsg = "Unknown error";
      
      if (error.code === 'ECONNABORTED') {
        errMsg = "The analysis is taking longer than expected. Please try again in a few seconds.";
      } else if (error.response) {
        // Server responded with non-2xx code
        const data = error.response.data;
        // 서버에서 전달한 구체적인 에러 메시지가 있으면 우선적으로 표시
        errMsg = data?.error || data?.detail || `Server Error (${error.response.status})`;
        if (data?.detail && typeof data.detail === 'object') {
            errMsg += "\n" + JSON.stringify(data.detail);
        }
      } else if (error.request) {
        errMsg = "Cannot reach the server. Please check your internet or wait for the backend to wake up.";
      } else {
        errMsg = error.message;
      }
      
      Alert.alert("Analysis Failed", errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;

    try {
      await saveMeal({
        date: mealDate,
        meal_type: mealType,
        menu_name: result.menu_name,
        kcal: result.kcal,
        carbs_g: result.carbs_g,
        protein_g: result.protein_g,
        fat_g: result.fat_g,
        image_uri: image
      });
      Alert.alert("Success", "Meal logged successfully!");
      setResult(null);
      setImage(null);
      loadDailyProgress();
      navigation.navigate('History');
    } catch (error) {
      Alert.alert("Error", "Failed to save meal.");
    }
  };

  const MealTypeSelector = () => (
    <View style={styles.selectorContainer}>
      {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((type) => (
        <TouchableOpacity 
          key={type} 
          style={[styles.typeButton, mealType === type && styles.selectedType]}
          onPress={() => setMealType(type)}
        >
          <Text style={[styles.typeText, mealType === type && styles.selectedTypeText]}>{type}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.progressCard}>
        <Text style={styles.cardTitle}>Today's Progress</Text>
        <ProgressBar 
          label="Calories" 
          current={dailyStats.kcal} 
          target={goals.target_kcal} 
          color="#FF6B6B" 
        />
        <ProgressBar 
          label="Carbs" 
          current={dailyStats.carbs} 
          target={goals.target_carbs} 
          color="#4D96FF" 
        />
        <ProgressBar 
          label="Protein" 
          current={dailyStats.protein} 
          target={goals.target_protein} 
          color="#6BCB77" 
        />
        <ProgressBar 
          label="Fat" 
          current={dailyStats.fat} 
          target={goals.target_fat} 
          color="#FFD93D" 
        />
      </View>
      
      {image ? (
        <Image source={{ uri: image }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Select a food photo</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.iconButton} onPress={pickImage}>
          <ImageIcon size={20} color="#fff" />
          <Text style={styles.buttonText}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={takePhoto}>
          <Camera size={20} color="#fff" />
          <Text style={styles.buttonText}>Camera</Text>
        </TouchableOpacity>
      </View>

      {image && (
        <View style={styles.metaInfo}>
          <Text style={styles.metaText}>📅 {mealDate}</Text>
          <MealTypeSelector />
        </View>
      )}

      {image && !loading && !result && (
        <TouchableOpacity style={[styles.button, styles.analyzeButton]} onPress={analyzeFood}>
          <Text style={styles.buttonText}>Start AI Analysis</Text>
        </TouchableOpacity>
      )}

      {loading && <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />}

      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>AI Analysis Result</Text>
          <Text style={styles.foodName}>{result.menu_name}</Text>
          <View style={styles.divider} />
          <View style={styles.nutrientGrid}>
            <View style={styles.nutrientItem}>
              <Text style={styles.nutrientVal}>{result.kcal}</Text>
              <Text style={styles.nutrientLabel}>kcal</Text>
            </View>
            <View style={styles.nutrientItem}>
              <Text style={styles.nutrientVal}>{result.carbs_g}g</Text>
              <Text style={styles.nutrientLabel}>Carbs</Text>
            </View>
            <View style={styles.nutrientItem}>
              <Text style={styles.nutrientVal}>{result.protein_g}g</Text>
              <Text style={styles.nutrientLabel}>Protein</Text>
            </View>
            <View style={styles.nutrientItem}>
              <Text style={styles.nutrientVal}>{result.fat_g}g</Text>
              <Text style={styles.nutrientLabel}>Fat</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Save size={20} color="#fff" />
            <Text style={styles.saveButtonText}>Confirm & Log Meal</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ marginTop: 30, alignItems: 'center', opacity: 0.3 }}>
        <Text style={{ fontSize: 10 }}>v1.0.6 (REST Backend - 2026-03-07)</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 20,
    paddingBottom: 40,
  },
  progressCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 20,
    marginBottom: 15,
  },
  placeholder: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: '#888',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  iconButton: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0.48,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
    marginLeft: 8,
  },
  analyzeButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  metaInfo: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
  },
  metaText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  selectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  selectedType: {
    backgroundColor: '#007bff',
  },
  typeText: {
    fontSize: 12,
    color: '#666',
  },
  selectedTypeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  resultCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  resultTitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 5,
  },
  foodName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginBottom: 15,
  },
  nutrientGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  nutrientItem: {
    alignItems: 'center',
  },
  nutrientVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
  },
  nutrientLabel: {
    fontSize: 12,
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 10,
  },
});
