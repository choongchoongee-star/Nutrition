import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { suggestMealType, formatDate, extractDateFromUri } from '../utils/metadata';
import { saveMeal, getMealsByDate, getGoals } from '../db/database';
import { Camera, Image as ImageIcon, Save, Plus, X } from 'lucide-react-native';
import ProgressBar from '../components/ProgressBar';
import { useFocusEffect } from '@react-navigation/native';

const MODEL_ID = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

const PROMPT_SINGLE = "Analyze this food image and return ONLY JSON: {\"menu_name\":str, \"kcal\":float, \"carbs_g\":float, \"protein_g\":float, \"fat_g\":float}";
const PROMPT_BEFORE_AFTER = "Two food photos are provided: the FIRST image is BEFORE eating, the SECOND image is AFTER eating. Based on the visual difference (the amount of food consumed), estimate the nutritional content of ONLY the consumed portion. Return ONLY JSON: {\"menu_name\":str, \"kcal\":float, \"carbs_g\":float, \"protein_g\":float, \"fat_g\":float}";

const showAlert = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function HomeScreen() {
  const [analysisMode, setAnalysisMode] = useState('single'); // 'single' | 'multi' | 'before_after'

  // Single mode
  const [image, setImage] = useState(null);

  // Multi mode
  const [multiImages, setMultiImages] = useState([]); // [{uri, result, loading}]

  // Before/after mode
  const [beforeImage, setBeforeImage] = useState(null);
  const [afterImage, setAfterImage] = useState(null);

  const [photoDate, setPhotoDate] = useState(null);

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

  const pickFromLibrary = async (setter, extractDate = false) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, exif: true });
    if (!res.canceled) {
      const asset = res.assets[0];
      setter(asset.uri);
      setResult(null);
      setErrorLog(null);
      if (extractDate) {
        const date = await extractDateFromUri(asset.uri, asset.exif);
        setPhotoDate(date);
      }
    }
  };

  const pickMultiImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.5,
    });
    if (!res.canceled && res.assets.length > 0) {
      const items = res.assets.map(a => ({ uri: a.uri, result: null, loading: false, error: null }));
      setMultiImages(items);
      setErrorLog(null);
    }
  };

  const pickBeforeAfterPair = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 2,
      quality: 0.5,
      orderedSelection: true,
    });
    if (!res.canceled && res.assets.length >= 2) {
      setBeforeImage(res.assets[0].uri);
      setAfterImage(res.assets[1].uri);
      setResult(null);
      setErrorLog(null);
      const date = await extractDateFromUri(res.assets[0].uri, res.assets[0].exif);
      setPhotoDate(date);
    } else if (!res.canceled && res.assets.length === 1) {
      setBeforeImage(res.assets[0].uri);
      setAfterImage(null);
      setResult(null);
      setErrorLog(null);
      const date = await extractDateFromUri(res.assets[0].uri, res.assets[0].exif);
      setPhotoDate(date);
    }
  };

  const takePhoto = async (setter) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return showAlert("알림", "카메라 접근 권한이 필요합니다.");
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!res.canceled) { setter(res.assets[0].uri); setResult(null); setErrorLog(null); }
  };

  const parseJsonResult = (apiResponse) => {
    const rawText = apiResponse.data.candidates[0].content.parts[0].text;
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}') + 1;
    const parsed = JSON.parse(rawText.substring(start, end));
    return {
      menu_name: parsed.menu_name || "알 수 없는 음식",
      kcal: Number(parsed.kcal) || 0,
      carbs_g: Number(parsed.carbs_g) || 0,
      protein_g: Number(parsed.protein_g) || 0,
      fat_g: Number(parsed.fat_g) || 0,
    };
  };

  // --- Analysis ---

  const analyzeSingle = async () => {
    setErrorLog(null);
    if (!GOOGLE_API_KEY) return setErrorLog("API 키가 설정되지 않았습니다.");
    setLoading(true);
    try {
      const base64 = await getBase64FromUri(image);
      const res = await axios.post(`${GEMINI_API_URL}?key=${GOOGLE_API_KEY}`, {
        contents: [{ parts: [
          { text: PROMPT_SINGLE },
          { inline_data: { mime_type: "image/jpeg", data: base64 } },
        ]}],
        generationConfig: { temperature: 0.1 },
      });
      setResult(parseJsonResult(res));
    } catch (error) {
      setErrorLog(`분석 중 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const analyzeBeforeAfter = async () => {
    setErrorLog(null);
    if (!GOOGLE_API_KEY) return setErrorLog("API 키가 설정되지 않았습니다.");
    setLoading(true);
    try {
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
      setResult(parseJsonResult(res));
    } catch (error) {
      setErrorLog(`분석 중 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const analyzeMulti = async () => {
    setErrorLog(null);
    if (!GOOGLE_API_KEY) return setErrorLog("API 키가 설정되지 않았습니다.");
    setLoading(true);

    const updated = [...multiImages];
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], loading: true };
      setMultiImages([...updated]);
      try {
        const base64 = await getBase64FromUri(updated[i].uri);
        const res = await axios.post(`${GEMINI_API_URL}?key=${GOOGLE_API_KEY}`, {
          contents: [{ parts: [
            { text: PROMPT_SINGLE },
            { inline_data: { mime_type: "image/jpeg", data: base64 } },
          ]}],
          generationConfig: { temperature: 0.1 },
        });
        updated[i] = { ...updated[i], result: parseJsonResult(res), loading: false };
      } catch (error) {
        updated[i] = { ...updated[i], error: error.message, loading: false };
      }
      setMultiImages([...updated]);
    }
    setLoading(false);
  };

  const analyzeFood = () => {
    if (analysisMode === 'single') analyzeSingle();
    else if (analysisMode === 'before_after') analyzeBeforeAfter();
    else if (analysisMode === 'multi') analyzeMulti();
  };

  // --- Save ---

  const handleSave = async () => {
    if (!result) return;
    setLoading(true);
    try {
      const mealDate = photoDate || formatDate(new Date());
      await saveMeal({
        date: mealDate,
        meal_type: suggestMealType(new Date().getHours()),
        menu_name: result.menu_name,
        kcal: result.kcal,
        carbs_g: result.carbs_g,
        protein_g: result.protein_g,
        fat_g: result.fat_g,
      });
      showAlert("성공", "식단이 기록되었습니다!");
      setResult(null); setImage(null); setBeforeImage(null); setAfterImage(null);
      loadDailyProgress();
    } catch (error) {
      showAlert("실패", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMulti = async () => {
    const toSave = multiImages.filter(item => item.result);
    if (toSave.length === 0) return;
    setLoading(true);
    try {
      const mealDate = formatDate(new Date());
      for (const item of toSave) {
        await saveMeal({
          date: mealDate,
          meal_type: suggestMealType(new Date().getHours()),
          menu_name: item.result.menu_name,
          kcal: item.result.kcal,
          carbs_g: item.result.carbs_g,
          protein_g: item.result.protein_g,
          fat_g: item.result.fat_g,
        });
      }
      showAlert("성공", `${toSave.length}개 식단이 기록되었습니다!`);
      setMultiImages([]);
      loadDailyProgress();
    } catch (error) {
      showAlert("실패", error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Mode switch ---

  const switchMode = (mode) => {
    setAnalysisMode(mode);
    setResult(null); setErrorLog(null);
    setImage(null); setBeforeImage(null); setAfterImage(null); setPhotoDate(null);
    setMultiImages([]);
  };

  const canAnalyze = !loading && (
    analysisMode === 'single' ? (!!image && !result) :
    analysisMode === 'before_after' ? (!!beforeImage && !!afterImage && !result) :
    analysisMode === 'multi' ? (multiImages.length > 0 && multiImages.every(i => !i.result && !i.loading)) :
    false
  );

  const multiHasResults = multiImages.some(i => i.result);

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
        {[
          { key: 'single', label: '단일' },
          { key: 'multi', label: '여러 장' },
          { key: 'before_after', label: '전후 비교' },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.modeBtn, analysisMode === key && styles.modeBtnActive]}
            onPress={() => switchMode(key)}
          >
            <Text style={[styles.modeBtnText, analysisMode === key && styles.modeBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 단일 사진 모드 */}
      {analysisMode === 'single' && (
        <>
          {image
            ? <Image source={{ uri: image }} style={styles.image} />
            : <View style={styles.placeholder}><Text style={styles.placeholderText}>음식 사진을 선택해주세요</Text></View>
          }
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => pickFromLibrary(setImage, true)}>
              <ImageIcon size={20} color="#fff" /><Text style={styles.btnText}>갤러리</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => takePhoto(setImage)}>
              <Camera size={20} color="#fff" /><Text style={styles.btnText}>카메라</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* 여러 장 모드 */}
      {analysisMode === 'multi' && (
        <>
          {multiImages.length === 0 ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>여러 장의 음식 사진을 선택해주세요</Text>
            </View>
          ) : (
            <View style={styles.multiGrid}>
              {multiImages.map((item, idx) => (
                <View key={idx} style={styles.multiItem}>
                  <Image source={{ uri: item.uri }} style={styles.multiImage} />
                  {item.loading && <ActivityIndicator style={styles.multiOverlay} color="#007bff" />}
                  {item.result && (
                    <View style={styles.multiResultBadge}>
                      <Text style={styles.multiResultText}>{item.result.menu_name}</Text>
                      <Text style={styles.multiResultKcal}>{item.result.kcal} kcal</Text>
                    </View>
                  )}
                  {item.error && (
                    <View style={[styles.multiResultBadge, { backgroundColor: '#fff0f0' }]}>
                      <Text style={{ fontSize: 10, color: '#d32f2f' }}>오류</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.multiRemoveBtn}
                    onPress={() => setMultiImages(multiImages.filter((_, i) => i !== idx))}
                  >
                    <X size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.iconBtn} onPress={pickMultiImages}>
              <Plus size={20} color="#fff" /><Text style={styles.btnText}>사진 선택</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* 전후 비교 모드 */}
      {analysisMode === 'before_after' && (
        <>
          <View style={styles.beforeAfterRow}>
            {[
              { label: '식사 전', uri: beforeImage },
              { label: '식사 후', uri: afterImage },
            ].map(({ label, uri }) => (
              <View key={label} style={styles.slot}>
                <Text style={styles.slotLabel}>{label}</Text>
                {uri
                  ? <Image source={{ uri }} style={styles.slotImage} />
                  : <View style={styles.slotPlaceholder}><Text style={styles.placeholderText}>사진 없음</Text></View>
                }
              </View>
            ))}
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.iconBtn} onPress={pickBeforeAfterPair}>
              <ImageIcon size={20} color="#fff" /><Text style={styles.btnText}>전후 사진 선택</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* 분석 버튼 */}
      {canAnalyze && (
        <TouchableOpacity style={styles.analyzeBtn} onPress={analyzeFood}>
          <Text style={styles.btnText}>
            {analysisMode === 'multi' ? `AI 분석 시작 (${multiImages.length}장)` : 'AI 분석 시작'}
          </Text>
        </TouchableOpacity>
      )}

      {loading && analysisMode !== 'multi' && <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />}

      {errorLog && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>알림</Text>
          <Text style={styles.errorText}>{errorLog}</Text>
          <TouchableOpacity onPress={() => setErrorLog(null)} style={{ marginTop: 10 }}>
            <Text style={{ color: '#d32f2f', textAlign: 'right' }}>닫기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 단일/전후 분석 결과 */}
      {result && (analysisMode === 'single' || analysisMode === 'before_after') && (
        <View style={styles.resultCard}>
          <Text style={styles.foodName}>{result.menu_name}</Text>
          <Text style={styles.diffNote}>
            {photoDate ? `${photoDate} 기록 예정` : `${formatDate(new Date())} (오늘)`}
            {analysisMode === 'before_after' ? '  |  실제 섭취량 기준' : ''}
          </Text>
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

      {/* 멀티 일괄 저장 */}
      {analysisMode === 'multi' && multiHasResults && (
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveMulti}>
          <Save size={20} color="#fff" />
          <Text style={styles.saveBtnText}>
            {multiImages.filter(i => i.result).length}개 식단 일괄 저장
          </Text>
        </TouchableOpacity>
      )}

      <View style={{ marginTop: 30, alignItems: 'center', opacity: 0.3 }}>
        <Text style={{ fontSize: 10 }}>v1.5.0</Text>
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
  modeBtnText: { fontWeight: '600', color: '#666', fontSize: 13 },
  modeBtnTextActive: { color: '#fff' },

  // Single mode
  image: { width: '100%', height: 280, borderRadius: 20, marginBottom: 15 },
  placeholder: { width: '100%', height: 200, backgroundColor: '#f0f0f0', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ddd' },
  placeholderText: { color: '#888', fontSize: 13 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  iconBtn: { backgroundColor: '#007bff', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', flex: 0.48, justifyContent: 'center', marginHorizontal: 4 },
  btnText: { color: '#fff', fontWeight: '600', marginLeft: 8 },

  // Multi mode
  multiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  multiItem: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  multiImage: { width: '100%', height: '100%' },
  multiOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.6)' },
  multiResultBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.9)', padding: 4 },
  multiResultText: { fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  multiResultKcal: { fontSize: 9, color: '#007bff', textAlign: 'center' },
  multiRemoveBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 2 },

  // Before/After mode
  beforeAfterRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  slot: { flex: 0.48 },
  slotLabel: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#333' },
  slotImage: { width: '100%', height: 160, borderRadius: 14, marginBottom: 8 },
  slotPlaceholder: { width: '100%', height: 160, backgroundColor: '#f0f0f0', borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ddd' },

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
  saveBtn: { backgroundColor: '#007bff', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
});
