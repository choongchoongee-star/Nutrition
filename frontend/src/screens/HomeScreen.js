import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { getImageMetadata, suggestMealType, formatDate } from '../utils/metadata';
import { saveMeal, getMealsByDate, getGoals } from '../db/database';
import { Camera, Image as ImageIcon, Save } from 'lucide-react-native';
import ProgressBar from '../components/ProgressBar';
import { useFocusEffect } from '@react-navigation/native';

// 이제 백엔드 주소 대신 Google API 주소를 직접 사용합니다.
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export default function HomeScreen({ navigation }) {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  // API Key 관리 (환경 변수에서 가져오거나 나중에 설정에서 입력받을 수 있습니다)
  // 보안을 위해 실제 배포 시에는 환경 변수 설정을 권장합니다.
  const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY || ""; 

  // Progress tracking state
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
    if (!image) return;
    
    // API KEY 체크 (중요!)
    const apiKey = GOOGLE_API_KEY; 
    if (!apiKey) {
      Alert.alert("API Key Missing", "Gemini API Key가 설정되지 않았습니다. 개발 환경 변수를 확인하세요.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // 1. 이미지 데이터를 Base64로 변환
      const response = await fetch(image);
      const blob = await response.blob();
      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });

      // 2. Gemini API 직접 호출 (서버 타임아웃 걱정 없음!)
      const prompt = "음식 영양 분석 (결과만 JSON): {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}";
      
      const apiResponse = await axios.post(`${GEMINI_API_URL}?key=${apiKey}`, {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
      }, { timeout: 60000 }); // 60초까지 넉넉하게 대기 가능

      const txt = apiResponse.data.candidates[0].content.parts[0].text;
      
      // JSON 추출
      const start = txt.find('{');
      const end = txt.rfind('}');
      const jsonStr = txt.substring(start, end + 1);
      const data = JSON.parse(jsonStr);
      
      setResult(data);
    } catch (error) {
      console.error("Direct Analysis Error:", error);
      Alert.alert("Analysis Failed", "AI 분석에 실패했습니다. 네트워크 상태나 API 키를 확인하세요.");
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
      Alert.alert("Success", "Meal logged!");
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
      
      {image ? <Image source={{ uri: image }} style={styles.image} /> : (
        <View style={styles.placeholder}><Text>Select a food photo</Text></View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.iconButton} onPress={pickImage}><ImageIcon size={20} color="#fff" /><Text style={styles.buttonText}>Gallery</Text></TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={takePhoto}><Camera size={20} color="#fff" /><Text style={styles.buttonText}>Camera</Text></TouchableOpacity>
      </View>

      {image && !loading && !result && (
        <TouchableOpacity style={[styles.button, styles.analyzeButton]} onPress={analyzeFood}>
          <Text style={styles.buttonText}>Start AI Analysis (Direct)</Text>
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
        <Text style={{ fontSize: 10 }}>v1.1.0 (Direct AI Mode - No Server Timeout)</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 20 },
  progressCard: { backgroundColor: '#f8f9fa', borderRadius: 20, padding: 20, marginBottom: 25 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  image: { width: '100%', height: 300, borderRadius: 20, marginBottom: 15 },
  placeholder: { width: '100%', height: 300, backgroundColor: '#f0f0f0', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
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
