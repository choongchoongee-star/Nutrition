import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { suggestMealType, formatDate } from '../utils/metadata';
import { saveMeal, getMealsByDate, getGoals } from '../db/database';
import { Camera, Image as ImageIcon, Save } from 'lucide-react-native';
import ProgressBar from '../components/ProgressBar';
import { useFocusEffect } from '@react-navigation/native';

const MODEL_ID = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

const PROMPT_SINGLE = "Analyze this food image and return ONLY JSON: {\"menu_name\":str, \"kcal\":float, \"carbs_g\":float, \"protein_g\":float, \"fat_g\":float}";
const PROMPT_BEFORE_AFTER = "Two food photos are provided: the FIRST image is BEFORE eating, the SECOND image is AFTER eating. Based on the visual difference (the amount of food consumed), estimate the nutritional content of ONLY the consumed portion. Return ONLY JSON: {\"menu_name\":str, \"kcal\":float, \"carbs_g\":float, \"protein_g\":float, \"fat_g\":float}";

export default function HomeScreen() {
  const [analysisMode, setAnalysisMode] = useState('single'); // 'single' | 'before_after'

  // Single mode
  const [image, setImage] = useState(null);

  // Before/after mode
  const [beforeImage, setBeforeImage] = useState(null);
  const [afterImage, setAfterImage] = useState(null);

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

  // --- Helpers ---

  const getBase64FromUri = async (uri) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  };

  const pickFromLibrary = async (setter) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!res.canceled) { setter(res.assets[0].uri); setResult(null); setErrorLog(null); }
  };

  const takePhoto = async (setter) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("알림", "카메라 접근 권한이 필요합니다.");
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!res.canceled) { setter(res.assets[0].uri); setResult(null); setErrorLog(null); }
  };

  const parseResult = (apiResponse) => {
    const rawText = apiResponse.data.candidates[0].content.parts[0].text;
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}') + 1;
    const parsed = JSON.parse(rawText.substring(start, end));
    setResult({
      menu_name: parsed.menu_name || "알 수 없는 음식",
      kcal: Number(parsed.kcal) || 0,
      carbs_g: Number(parsed.carbs_g) || 0,
      protein_g: Number(parsed.protein_g) || 0,
      fat_g: Number(parsed.fat_g) || 0,
    });
  };

  // --- Analysis ---

  const analyzeFood = async () => {
    setErrorLog(null);
    if (!GOOGLE_API_KEY) return setErrorLog("API 키가 설정되지 않았습니다.");
    setLoading(true);
    try {
      if (analysisMode === 'single') {
        const base64 = await getBase64FromUri(image);
        const res = await axios.post(`${GEMINI_API_URL}?key=${GOOGLE_API_KEY}`, {
          contents: [{ parts: [
            { text: PROMPT_SINGLE },
            { inline_data: { mime_type: "image/jpeg", data: base64 } },
          ]}],
          generationConfig: { temperature: 0.1 },
        });
        parseResult(res);
      } else {
        const [beforeBase64, afterBase64] = await Promise.all([
          getBase64FromUri(beforeImage),
          getBase64FromUri(afterImage),
        ]);
        const res = await axios.post(`${GEMINI_API_URL}?key=${GOOGLE_API_KEY}`, {
          contents: [{ parts: [
            { text: PROMPT_BEFORE_AFTER },
            { inline_data: { mime_type: "image/jpeg", data: beforeBase64 } },
            { inline_data: { mime_type: "image/jpeg", data: afterBase64 } },
          ]}],
          generationConfig: { temperature: 0.1 },
        });
        parseResult(res);
      }
    } catch (error) {
      setErrorLog(`분석 중 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Save ---

  const handleSave = async () => {
    if (!result) return;
    setLoading(true);
    try {
      await saveMeal({
        date: formatDate(new Date()),
        meal_type: suggestMealType(new Date().getHours()),
        menu_name: result.menu_name,
        kcal: result.kcal,
        carbs_g: result.carbs_g,
        protein_g: result.protein_g,
        fat_g: result.fat_g,
      });
      Alert.alert("성공", "식단이 기록되었습니다!");
      setResult(null); setImage(null); setBeforeImage(null); setAfterImage(null);
      loadDailyProgress();
    } catch (error) {
      Alert.alert("실패", `이유: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Mode switch ---

  const switchMode = (mode) => {
    setAnalysisMode(mode);
    setResult(null); setErrorLog(null);
    setImage(null); setBeforeImage(null); setAfterImage(null);
  };

  const canAnalyze = !loading && !result && (
    analysisMode === 'single' ? !!image : (!!beforeImage && !!afterImage)
  );

  // --- Render ---

  return (
    <ScrollView contentContainerStyle={styles.container}>

      {/* 오늘의 영양 상태 */}
      <View style={styles.progressCard}>
        <Text style={styles.cardTitle}>오늘의 영양 상태</Text>
        <ProgressBar label="칼로리" current={dailyStats.kcal} target={goals.target_kcal} color="#FF6B6B" unit="kcal" />
        <ProgressBar label="탄수화물" current={dailyStats.carbs} target={goals.target_carbs} color="#4D96FF" unit="g" />
        <ProgressBar label="단백질" current={dailyStats.protein} target={goals.target_protein} color="#6BCB77" unit="g" />
        <ProgressBar label="지방" current={dailyStats.fat} target={goals.target_fat} color="#FFD93D" unit="g" />
      </View>

      {/* 모드 토글 */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, analysisMode === 'single' && styles.modeBtnActive]}
          onPress={() => switchMode('single')}
        >
          <Text style={[styles.modeBtnText, analysisMode === 'single' && styles.modeBtnTextActive]}>단일 사진</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, analysisMode === 'before_after' && styles.modeBtnActive]}
          onPress={() => switchMode('before_after')}
        >
          <Text style={[styles.modeBtnText, analysisMode === 'before_after' && styles.modeBtnTextActive]}>전후 비교</Text>
        </TouchableOpacity>
      </View>

      {/* 단일 사진 모드 */}
      {analysisMode === 'single' && (
        <>
          {image
            ? <Image source={{ uri: image }} style={styles.image} />
            : <View style={styles.placeholder}><Text style={styles.placeholderText}>음식 사진을 선택해주세요</Text></View>
          }
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => pickFromLibrary(setImage)}>
              <ImageIcon size={20} color="#fff" /><Text style={styles.btnText}>갤러리</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => takePhoto(setImage)}>
              <Camera size={20} color="#fff" /><Text style={styles.btnText}>카메라</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* 전후 비교 모드 */}
      {analysisMode === 'before_after' && (
        <View style={styles.beforeAfterRow}>
          {[
            { label: '식사 전', uri: beforeImage, setter: setBeforeImage },
            { label: '식사 후', uri: afterImage,  setter: setAfterImage  },
          ].map(({ label, uri, setter }) => (
            <View key={label} style={styles.slot}>
              <Text style={styles.slotLabel}>{label}</Text>
              {uri
                ? <Image source={{ uri }} style={styles.slotImage} />
                : <View style={styles.slotPlaceholder}><Text style={styles.placeholderText}>사진 없음</Text></View>
              }
              <View style={styles.slotBtnRow}>
                <TouchableOpacity style={styles.slotBtn} onPress={() => pickFromLibrary(setter)}>
                  <ImageIcon size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.slotBtn} onPress={() => takePhoto(setter)}>
                  <Camera size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 분석 버튼 */}
      {canAnalyze && (
        <TouchableOpacity style={styles.analyzeBtn} onPress={analyzeFood}>
          <Text style={styles.btnText}>AI 분석 시작</Text>
        </TouchableOpacity>
      )}

      {loading && <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />}

      {errorLog && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>⚠️ 알림</Text>
          <Text style={styles.errorText}>{errorLog}</Text>
          <TouchableOpacity onPress={() => setErrorLog(null)} style={{ marginTop: 10 }}>
            <Text style={{ color: '#d32f2f', textAlign: 'right' }}>닫기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 분석 결과 */}
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.foodName}>{result.menu_name}</Text>
          {analysisMode === 'before_after' && (
            <Text style={styles.diffNote}>* 실제 섭취량 기준 계산</Text>
          )}
          <View style={styles.nutrientGrid}>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.kcal}</Text><Text>kcal</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.carbs_g}g</Text><Text>탄수화물</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.protein_g}g</Text><Text>단백질</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{result.fat_g}g</Text><Text>지방</Text></View>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Save size={20} color="#fff" />
            <Text style={styles.saveBtnText}>식단 기록하기</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ marginTop: 30, alignItems: 'center', opacity: 0.3 }}>
        <Text style={{ fontSize: 10 }}>v1.4.0 (전후 비교 분석)</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 20 },

  // Progress
  progressCard: { backgroundColor: '#f8f9fa', borderRadius: 20, padding: 20, marginBottom: 20 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },

  // Mode toggle
  modeToggle: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 12, padding: 4, marginBottom: 20 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#007bff' },
  modeBtnText: { fontWeight: '600', color: '#666' },
  modeBtnTextActive: { color: '#fff' },

  // Single mode
  image: { width: '100%', height: 280, borderRadius: 20, marginBottom: 15 },
  placeholder: { width: '100%', height: 280, backgroundColor: '#f0f0f0', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ddd' },
  placeholderText: { color: '#888', fontSize: 13 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  iconBtn: { backgroundColor: '#007bff', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', flex: 0.48, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '600', marginLeft: 8 },

  // Before/After mode
  beforeAfterRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  slot: { flex: 0.48 },
  slotLabel: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#333' },
  slotImage: { width: '100%', height: 160, borderRadius: 14, marginBottom: 8 },
  slotPlaceholder: { width: '100%', height: 160, backgroundColor: '#f0f0f0', borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ddd' },
  slotBtnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  slotBtn: { backgroundColor: '#007bff', padding: 10, borderRadius: 10, flex: 0.48, alignItems: 'center' },

  // Analyze
  analyzeBtn: { backgroundColor: '#28a745', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15 },

  // Error
  errorBox: { backgroundColor: '#fff0f0', padding: 15, borderRadius: 12, marginTop: 10, borderLeftWidth: 5, borderLeftColor: '#ff4d4d' },
  errorTitle: { fontWeight: 'bold', color: '#d32f2f', marginBottom: 5 },
  errorText: { fontSize: 12, color: '#333' },

  // Result
  resultCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginTop: 10, borderWidth: 1, borderColor: '#eee' },
  foodName: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  diffNote: { fontSize: 12, color: '#28a745', marginBottom: 12 },
  nutrientGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, marginTop: 12 },
  nutrientItem: { alignItems: 'center' },
  nutrientVal: { fontSize: 18, fontWeight: 'bold', color: '#007bff' },
  saveBtn: { backgroundColor: '#007bff', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
});
