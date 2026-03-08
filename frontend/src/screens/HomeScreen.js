import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { getImageMetadata, suggestMealType, formatDate } from '../utils/metadata';
import { saveMeal, getMealsByDate, getGoals } from '../db/database';
import { Camera, Image as ImageIcon, Save } from 'lucide-react-native';
import ProgressBar from '../components/ProgressBar';
import { useFocusEffect } from '@react-navigation/native';

const MODEL_ID = "gemini-2.5-flash"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

export default function HomeScreen({ navigation }) {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorLog, setErrorLog] = useState(null); 
  
  const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY || ""; 

  const [dailyStats, setDailyStats] = useState({ kcal: 0, carbs: 0, protein: 0, fat: 0 });
  const [goals, setGoals] = useState({ target_kcal: 2000, target_carbs: 250, target_protein: 60, target_fat: 50 });

  const loadDailyProgress = useCallback(async () => {
    try {
      const today = formatDate(new Date());
      const [meals, userGoals] = await Promise.all([getMealsByDate(today), getGoals()]);
      if (userGoals) setGoals(userGoals);
      const stats = meals.reduce((acc, m) => ({
        kcal: acc.kcal + (Number(m.kcal) || 0),
        carbs: acc.carbs + (Number(m.carbs_g) || 0),
        protein: acc.protein + (Number(m.protein_g) || 0),
        fat: acc.fat + (Number(m.fat_g) || 0),
      }), { kcal: 0, carbs: 0, protein: 0, fat: 0 });
      setDailyStats(stats);
    } catch (e) {
      console.error("데이터 로드 실패:", e);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadDailyProgress(); }, [loadDailyProgress]));

  const handleImageSource = async (pickerResult) => {
    if (pickerResult.canceled) return;
    setImage(pickerResult.assets[0].uri);
    setResult(null);
    setErrorLog(null);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    await handleImageSource(result);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("알림", "카메라 접근 권한이 필요합니다.");
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    await handleImageSource(result);
  };

  const analyzeFood = async () => {
    if (!image) return;
    setErrorLog(null);
    if (!GOOGLE_API_KEY) return setErrorLog("API 키가 설정되지 않았습니다.");

    setLoading(true);
    try {
      const response = await fetch(image);
      const blob = await response.blob();
      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });

      const prompt = "Analyze food image and return ONLY JSON: {'menu_name':str, 'weight_g':float, 'kcal':float, 'carbs_g':float, 'protein_g':float, 'fat_g':float}";
      
      const apiResponse = await axios.post(`${GEMINI_API_URL}?key=${GOOGLE_API_KEY}`, {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } }
          ]
        }],
        generationConfig: { temperature: 0.1 }
      });

      const rawText = apiResponse.data.candidates[0].content.parts[0].text;
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const parsedData = JSON.parse(rawText.substring(start, end));
      
      setResult({
        menu_name: parsedData.menu_name || "알 수 없는 음식",
        kcal: Number(parsedData.kcal) || 0,
        carbs_g: Number(parsedData.carbs_g) || 0,
        protein_g: Number(parsedData.protein_g) || 0,
        fat_g: Number(parsedData.fat_g) || 0,
      });
    } catch (error) {
      setErrorLog(`분석 중 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

const handleSave = async () => {
    if (!result) return;
    setLoading(true);
    try {
      const mealData = {
        date: formatDate(new Date()),
        meal_type: suggestMealType(new Date().getHours()),
        menu_name: result.menu_name,
        kcal: result.kcal,
        carbs_g: result.carbs_g,
        protein_g: result.protein_g,
        fat_g: result.fat_g,
      };
      
      await saveMeal(mealData);
      Alert.alert("성공", "식단이 기록되었습니다!");
      setResult(null); setImage(null);
      loadDailyProgress();
    } catch (error) {
      Alert.alert("실패", `이유: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.progressCard}>
        <Text style={styles.cardTitle}>오늘의 영양 상태</Text>
        <ProgressBar label="칼로리" current={dailyStats.kcal} target={goals.target_kcal} color="#FF6B6B" unit="kcal" />
        <ProgressBar label="탄수화물" current={dailyStats.carbs} target={goals.target_carbs} color="#4D96FF" unit="g" />
        <ProgressBar label="단백질" current={dailyStats.protein} target={goals.target_protein} color="#6BCB77" unit="g" />
        <ProgressBar label="지방" current={dailyStats.fat} target={goals.target_fat} color="#FFD93D" unit="g" />
      </View>
      
      {image ? <Image source={{ uri: image }} style={styles.image} /> : (
        <View style={styles.placeholder}><Text style={{color: '#888'}}>음식 사진을 선택해주세요</Text></View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.iconButton} onPress={pickImage}><ImageIcon size={20} color="#fff" /><Text style={styles.buttonText}>갤러리</Text></TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={takePhoto}><Camera size={20} color="#fff" /><Text style={styles.buttonText}>카메라</Text></TouchableOpacity>
      </View>

      {image && !loading && !result && (
        <TouchableOpacity style={styles.analyzeButton} onPress={analyzeFood}>
          <Text style={styles.buttonText}>AI 분석 시작</Text>
        </TouchableOpacity>
      )}

      {loading && <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />}

      {errorLog && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ 알림</Text>
          <Text style={styles.errorText}>{errorLog}</Text>
          <TouchableOpacity onPress={() => setErrorLog(null)} style={{marginTop: 10}}><Text style={{color: '#d32f2f', textAlign: 'right'}}>닫기</Text></TouchableOpacity>
        </View>
      )}

      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.foodName}>{result.menu_name}</Text>
          <View style={styles.nutrientGrid}>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.kcal}</Text><Text>kcal</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.carbs_g}g</Text><Text>탄수화물</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.protein_g}g</Text><Text>단백질</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.fat_g}g</Text><Text>지방</Text></View>
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Save size={20} color="#fff" />
            <Text style={styles.saveButtonText}>식단 기록하기</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ marginTop: 30, alignItems: 'center', opacity: 0.3 }}>
        <Text style={{ fontSize: 10 }}>v1.3.0 (한글 지원 및 클라우드 동기화)</Text>
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
  errorContainer: { backgroundColor: '#fff0f0', padding: 15, borderRadius: 12, marginTop: 10, borderLeftWidth: 5, borderLeftColor: '#ff4d4d' },
  errorTitle: { fontWeight: 'bold', color: '#d32f2f', marginBottom: 5 },
  errorText: { fontSize: 12, color: '#333' },
  resultCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginTop: 10, borderWidth: 1, borderColor: '#eee' },
  foodName: { fontSize: 22, fontWeight: 'bold', marginBottom: 15 },
  nutrientGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  nutrientItem: { alignItems: 'center' },
  nutrientVal: { fontSize: 18, fontWeight: 'bold', color: '#007bff' },
  saveButton: { backgroundColor: '#007bff', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
});
