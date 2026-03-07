import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { getImageMetadata, suggestMealType, formatDate } from '../utils/metadata';
import { saveMeal, getMealsByDate, getGoals } from '../db/database';
import { Camera, Image as ImageIcon, Save } from 'lucide-react-native';
import ProgressBar from '../components/ProgressBar';
import { useFocusEffect } from '@react-navigation/native';

// 2026년 기준 리스트에 있는 Gemini 2.0 Flash 모델을 사용합니다.
const MODEL_ID = "gemini-2.0-flash"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

export default function HomeScreen({ navigation }) {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY || ""; 

  const [dailyStats, setDailyStats] = useState({ kcal: 0, carbs: 0, protein: 0, fat: 0 });
  const [goals, setGoals] = useState({ target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 });

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
    }, [loadDailyProgress])
  );

  const handleImageSource = async (pickerResult) => {
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets[0];
    setImage(asset.uri);
    setResult(null);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
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
      quality: 0.5,
    });
    await handleImageSource(result);
  };

  const analyzeFood = async () => {
    console.log(`Analyze attempt with ${MODEL_ID}...`);
    if (!image) return;
    
    const apiKey = GOOGLE_API_KEY; 
    if (!apiKey) {
      Alert.alert("API Key Missing", "환경 변수 설정이 필요합니다.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(image);
      const blob = await response.blob();
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const prompt = "Analyze food from image and return ONLY JSON: {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}";
      
      const apiResponse = await axios.post(`${GEMINI_API_URL}?key=${apiKey}`, {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
      });

      const txt = apiResponse.data.candidates[0].content.parts[0].text;
      const start = txt.find('{');
      const end = txt.rfind('}') + 1;
      const jsonStr = txt.substring(start, end);
      const data = JSON.parse(jsonStr);
      
      setResult(data);
    } catch (error) {
      console.error("Gemini API Error Detail:", error.response?.data || error.message);
      const serverError = error.response?.data?.error;
      const errorMsg = serverError ? `${serverError.code}: ${serverError.message}` : error.message;
      
      Alert.alert("Analysis Failed", `Reason: ${errorMsg}\n\nModel used: ${MODEL_ID}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      await saveMeal({
        date: formatDate(new Date()),
        meal_type: suggestMealType(new Date().getHours()),
        menu_name: result.menu_name,
        kcal: result.kcal,
        carbs_g: result.carbs_g,
        protein_g: result.protein_g,
        fat_g: result.fat_g,
        image_uri: image
      });
      Alert.alert("Success", "Logged!");
      setResult(null);
      setImage(null);
      loadDailyProgress();
    } catch (e) { Alert.alert("Error", "Save failed."); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.progressCard}>
        <Text style={styles.cardTitle}>Today's Progress</Text>
        <ProgressBar label="Calories" current={dailyStats.kcal} target={goals.target_kcal} color="#FF6B6B" />
        <ProgressBar label="Carbs" current={dailyStats.carbs} target={goals.target_carbs} color="#4D96FF" />
        <ProgressBar label="Protein" current={dailyStats.protein} target={goals.target_protein} color="#6BCB77" />
        <ProgressBar label="Fat" current={dailyStats.fat} target={goals.target_fat} color="#FFD93D" />
      </View>
      
      {image ? (
        <Image source={{ uri: image }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={{color: '#888'}}>Select a photo</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.iconButton} onPress={pickImage}><ImageIcon size={20} color="#fff" /><Text style={styles.buttonText}>Gallery</Text></TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={takePhoto}><Camera size={20} color="#fff" /><Text style={styles.buttonText}>Camera</Text></TouchableOpacity>
      </View>

      {image && !loading && !result && (
        <TouchableOpacity style={styles.analyzeButton} onPress={analyzeFood}>
          <Text style={styles.buttonText}>Start Analysis (Gemini 2.0)</Text>
        </TouchableOpacity>
      )}

      {loading && <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />}

      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.foodName}>{result.menu_name}</Text>
          <View style={styles.nutrientGrid}>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.kcal}</Text><Text>kcal</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.carbs_g}g</Text><Text>Carbs</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.protein_g}g</Text><Text>Protein</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.fat_g}g</Text><Text>Fat</Text></View>
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}><Save size={20} color="#fff" /><Text style={styles.saveButtonText}>Confirm & Log</Text></TouchableOpacity>
        </View>
      )}

      <View style={{ marginTop: 30, alignItems: 'center', opacity: 0.3 }}>
        <Text style={{ fontSize: 10 }}>v1.1.4 (Latest Model: Gemini 2.0)</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 20 },
  progressCard: { backgroundColor: '#f8f9fa', borderRadius: 20, padding: 20, marginBottom: 25 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  image: { width: '100%', height: 300, borderRadius: 20, marginBottom: 15 },
  placeholder: { width: '100%', height: 300, backgroundColor: '#f0f0f0', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ddd' },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  iconButton: { backgroundColor: '#007bff', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', flex: 0.48, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', marginLeft: 8 },
  analyzeButton: { backgroundColor: '#28a745', padding: 15, borderRadius: 12, alignItems: 'center' },
  resultCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginTop: 10, borderWidth: 1, borderColor: '#eee' },
  foodName: { fontSize: 22, fontWeight: 'bold', marginBottom: 15 },
  nutrientGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  nutrientItem: { alignItems: 'center' },
  nutrientVal: { fontSize: 18, fontWeight: 'bold', color: '#007bff' },
  saveButton: { backgroundColor: '#007bff', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
});
