import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
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
    const today = formatDate(new Date());
    const [meals, userGoals] = await Promise.all([getMealsByDate(today), getGoals()]);
    if (userGoals) setGoals(userGoals);
    const stats = meals.reduce((acc, m) => ({
      kcal: acc.kcal + m.kcal,
      carbs: acc.carbs + m.carbs_g,
      protein: acc.protein + m.protein_g,
      fat: acc.fat + m.fat_g,
    }), { kcal: 0, carbs: 0, protein: 0, fat: 0 });
    setDailyStats(stats);
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
    if (!permission.granted) return Alert.alert("Error", "Camera access denied");
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    await handleImageSource(result);
  };

  const analyzeFood = async () => {
    if (!image) return;
    setErrorLog(null);
    if (!GOOGLE_API_KEY) return setErrorLog("Missing API Key");

    setLoading(true);
    try {
      const response = await fetch(image);
      const blob = await response.blob();
      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });

      const prompt = "Analyze this food image. Return ONLY a valid JSON object with these keys: menu_name (string), weight_g (number), kcal (number), carbs_g (number), protein_g (number), fat_g (number). No markdown, no comments.";
      
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
      console.log("Raw AI Response:", rawText);

      // Robust JSON extraction
      try {
        const start = rawText.indexOf('{');
        const end = rawText.lastIndexOf('}') + 1;
        if (start === -1 || end === 0) throw new Error("No JSON found in response");
        
        const jsonStr = rawText.substring(start, end);
        const parsedData = JSON.parse(jsonStr);
        
        // Ensure numbers are actually numbers
        const cleanData = {
          menu_name: parsedData.menu_name || "Unknown Food",
          kcal: Number(parsedData.kcal) || 0,
          carbs_g: Number(parsedData.carbs_g) || 0,
          protein_g: Number(parsedData.protein_g) || 0,
          fat_g: Number(parsedData.fat_g) || 0
        };
        
        setResult(cleanData);
      } catch (parseErr) {
        setErrorLog(`Parse Error: ${parseErr.message}\nRaw Text: ${rawText}`);
      }
    } catch (error) {
      const detail = error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message;
      setErrorLog(`API Error: ${detail}`);
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
        kcal: result.kcal, carbs_g: result.carbs_g, protein_g: result.protein_g, fat_g: result.fat_g,
        image_uri: image
      });
      Alert.alert("Success", "Meal logged!");
      setResult(null); setImage(null);
      loadDailyProgress();
    } catch (e) { Alert.alert("Error", "Save failed"); }
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
        <View style={styles.placeholder}><Text style={{color: '#888'}}>Select food photo</Text></View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.iconButton} onPress={pickImage}><ImageIcon size={20} color="#fff" /><Text style={styles.buttonText}>Gallery</Text></TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={takePhoto}><Camera size={20} color="#fff" /><Text style={styles.buttonText}>Camera</Text></TouchableOpacity>
      </View>

      {image && !loading && !result && (
        <TouchableOpacity style={styles.analyzeButton} onPress={analyzeFood}>
          <Text style={styles.buttonText}>Analyze Food</Text>
        </TouchableOpacity>
      )}

      {loading && <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />}

      {errorLog && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ Analysis Issue</Text>
          <ScrollView style={styles.errorScroll} nestedScrollEnabled={true}>
            <Text style={styles.errorText}>{errorLog}</Text>
          </ScrollView>
          <TouchableOpacity onPress={() => setErrorLog(null)} style={{marginTop: 10}}><Text style={{color: '#d32f2f', textAlign: 'right'}}>Dismiss</Text></TouchableOpacity>
        </View>
      )}

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
        <Text style={{ fontSize: 10 }}>v1.1.8 (Ready for Action)</Text>
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
  errorScroll: { maxHeight: 150 },
  errorText: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, color: '#333' },
  resultCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginTop: 10, borderWidth: 1, borderColor: '#eee' },
  foodName: { fontSize: 22, fontWeight: 'bold', marginBottom: 15 },
  nutrientGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  nutrientItem: { alignItems: 'center' },
  nutrientVal: { fontSize: 18, fontWeight: 'bold', color: '#007bff' },
  saveButton: { backgroundColor: '#007bff', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
});
