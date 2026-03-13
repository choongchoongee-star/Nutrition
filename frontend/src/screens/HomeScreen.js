import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { suggestMealType, formatDate, extractDateFromUri } from '../utils/metadata';
import { saveMeal, getMealsByDate, getGoals } from '../db/database';
import { Camera, Image as ImageIcon, Save, X } from 'lucide-react-native';
import ProgressBar from '../components/ProgressBar';
import { useFocusEffect } from '@react-navigation/native';

const MODEL_ID = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

const PROMPT_SINGLE = "이 음식 사진을 분석하고 JSON만 반환하세요. menu_name은 반드시 한국어로 작성하세요: {\"menu_name\":str, \"kcal\":float, \"carbs_g\":float, \"protein_g\":float, \"fat_g\":float}";
const PROMPT_BEFORE_AFTER = "두 장의 음식 사진이 제공됩니다. 첫 번째는 식사 전, 두 번째는 식사 후입니다. 실제 섭취한 양만 기준으로 영양 정보를 추정하세요. menu_name은 반드시 한국어로 작성하고 JSON만 반환하세요: {\"menu_name\":str, \"kcal\":float, \"carbs_g\":float, \"protein_g\":float, \"fat_g\":float}";

const showAlert = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function HomeScreen() {
  // 2 modes only: 'normal' | 'before_after'
  const [analysisMode, setAnalysisMode] = useState('normal');

  // Unified image list: [{uri, result, loading, error}]
  const [images, setImages] = useState([]);

  const [photoDate, setPhotoDate] = useState(null);
  const [loading, setLoading] = useState(false);
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

  // --- Image picking ---

  const MAX_IMAGES = 10;

  const pickImages = async () => {
    const currentCount = images.length;
    const remaining = MAX_IMAGES - currentCount;
    if (remaining <= 0) {
      return showAlert("알림", `최대 ${MAX_IMAGES}장까지만 등록할 수 있습니다.`);
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.5,
      orderedSelection: true,
    });
    if (!res.canceled && res.assets.length > 0) {
      const existingUris = new Set(images.map(i => i.uri));
      const newItems = res.assets
        .filter(a => !existingUris.has(a.uri))
        .map(a => ({ uri: a.uri, result: null, loading: false, error: null }));
      const merged = [...images, ...newItems].slice(0, MAX_IMAGES);
      setImages(merged);
      setErrorLog(null);
      if (images.length === 0 && merged.length > 0) {
        const date = await extractDateFromUri(res.assets[0].uri, res.assets[0].exif);
        setPhotoDate(date);
      }
    }
  };

  const takePhoto = async () => {
    if (images.length >= MAX_IMAGES) {
      return showAlert("알림", `최대 ${MAX_IMAGES}장까지만 등록할 수 있습니다.`);
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return showAlert("알림", "카메라 접근 권한이 필요합니다.");
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!res.canceled) {
      const newItem = { uri: res.assets[0].uri, result: null, loading: false, error: null };
      setImages([...images, newItem].slice(0, MAX_IMAGES));
      setErrorLog(null);
    }
  };

  const removeImage = (idx) => {
    setImages(images.filter((_, i) => i !== idx));
  };

  // --- Derived state ---

  const imageCount = images.length;
  const isBeforeAfter = analysisMode === 'before_after';

  // before_after: must be even number of images, paired as (1&2), (3&4)...
  const pairCount = isBeforeAfter ? Math.floor(imageCount / 2) : 0;
  const hasOddWarning = isBeforeAfter && imageCount % 2 !== 0;
  const analysisCount = isBeforeAfter ? pairCount : imageCount;

  const allAnalyzed = images.length > 0 && images.every(i => i.result || i.error);
  const hasResults = images.some(i => i.result);
  const canAnalyze = !loading && imageCount > 0 && !allAnalyzed && (isBeforeAfter ? pairCount > 0 : true);

  // --- Analysis ---

  const analyzeFood = async () => {
    setErrorLog(null);
    if (!GOOGLE_API_KEY) return setErrorLog("API 키가 설정되지 않았습니다.");
    setLoading(true);

    const updated = [...images];

    if (isBeforeAfter) {
      // Pair analysis: (0,1), (2,3), (4,5)...
      for (let i = 0; i + 1 < updated.length; i += 2) {
        updated[i] = { ...updated[i], loading: true };
        updated[i + 1] = { ...updated[i + 1], loading: true };
        setImages([...updated]);
        try {
          const [beforeBase64, afterBase64] = await Promise.all([
            getBase64FromUri(updated[i].uri),
            getBase64FromUri(updated[i + 1].uri),
          ]);
          const res = await axios.post(`${GEMINI_API_URL}?key=${GOOGLE_API_KEY}`, {
            contents: [{ parts: [
              { text: PROMPT_BEFORE_AFTER },
              { inline_data: { mime_type: "image/jpeg", data: beforeBase64 } },
              { inline_data: { mime_type: "image/jpeg", data: afterBase64 } },
            ]}],
            generationConfig: { temperature: 0.1 },
          });
          const result = parseJsonResult(res);
          // Result goes on the "before" image, "after" gets a reference
          updated[i] = { ...updated[i], result, loading: false };
          updated[i + 1] = { ...updated[i + 1], result: null, loading: false, paired: true };
        } catch (error) {
          updated[i] = { ...updated[i], error: error.message, loading: false };
          updated[i + 1] = { ...updated[i + 1], error: error.message, loading: false };
        }
        setImages([...updated]);
      }
    } else {
      // Normal: each image analyzed individually
      for (let i = 0; i < updated.length; i++) {
        updated[i] = { ...updated[i], loading: true };
        setImages([...updated]);
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
        setImages([...updated]);
      }
    }
    setLoading(false);
  };

  // --- Save ---

  const handleSaveAll = async () => {
    const toSave = images.filter(item => item.result);
    if (toSave.length === 0) return;
    setLoading(true);
    try {
      const mealDate = photoDate || formatDate(new Date());
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
      setImages([]);
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
    setImages([]);
    setErrorLog(null);
    setPhotoDate(null);
  };

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
          style={[styles.modeBtn, analysisMode === 'normal' && styles.modeBtnActive]}
          onPress={() => switchMode('normal')}
        >
          <Text style={[styles.modeBtnText, analysisMode === 'normal' && styles.modeBtnTextActive]}>일반</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, analysisMode === 'before_after' && styles.modeBtnActive]}
          onPress={() => switchMode('before_after')}
        >
          <Text style={[styles.modeBtnText, analysisMode === 'before_after' && styles.modeBtnTextActive]}>전후 비교</Text>
        </TouchableOpacity>
      </View>

      {/* 사진 영역 */}
      {imageCount === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {isBeforeAfter
              ? '전후 사진을 짝수로 선택해주세요\n(1번째=전, 2번째=후, 3번째=전, ...)'
              : '음식 사진을 선택해주세요'}
          </Text>
        </View>
      ) : imageCount === 1 && !isBeforeAfter ? (
        // Single image: large view
        <View style={{ position: 'relative', marginBottom: 15 }}>
          <Image source={{ uri: images[0].uri }} style={styles.image} />
          {images[0].loading && <ActivityIndicator style={styles.singleOverlay} size="large" color="#007bff" />}
          {images[0].result && (
            <View style={styles.singleResultOverlay}>
              <Text style={styles.singleResultName}>{images[0].result.menu_name}</Text>
              <Text style={styles.singleResultKcal}>{images[0].result.kcal} kcal</Text>
            </View>
          )}
          <TouchableOpacity style={styles.singleRemoveBtn} onPress={() => setImages([])}>
            <X size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : isBeforeAfter ? (
        // Before/after: show pairs
        <View style={{ marginBottom: 15 }}>
          {Array.from({ length: Math.ceil(imageCount / 2) }).map((_, pairIdx) => {
            const beforeIdx = pairIdx * 2;
            const afterIdx = pairIdx * 2 + 1;
            const beforeItem = images[beforeIdx];
            const afterItem = afterIdx < imageCount ? images[afterIdx] : null;
            return (
              <View key={pairIdx} style={{ marginBottom: 12 }}>
                {analysisCount > 1 && <Text style={styles.pairLabel}>식사 {pairIdx + 1}</Text>}
                <View style={styles.beforeAfterRow}>
                  <View style={styles.slot}>
                    <Text style={styles.slotLabel}>전</Text>
                    <Image source={{ uri: beforeItem.uri }} style={styles.slotImage} />
                    {beforeItem.loading && <ActivityIndicator style={styles.slotOverlay} color="#007bff" />}
                  </View>
                  <View style={styles.slot}>
                    <Text style={styles.slotLabel}>후</Text>
                    {afterItem ? (
                      <>
                        <Image source={{ uri: afterItem.uri }} style={styles.slotImage} />
                        {afterItem.loading && <ActivityIndicator style={styles.slotOverlay} color="#007bff" />}
                      </>
                    ) : (
                      <View style={styles.slotPlaceholder}><Text style={styles.placeholderText}>사진 없음</Text></View>
                    )}
                  </View>
                </View>
                {beforeItem.result && (
                  <View style={styles.pairResult}>
                    <Text style={styles.pairResultName}>{beforeItem.result.menu_name}</Text>
                    <Text style={styles.pairResultInfo}>
                      {beforeItem.result.kcal} kcal | 탄:{beforeItem.result.carbs_g}g 단:{beforeItem.result.protein_g}g 지:{beforeItem.result.fat_g}g
                    </Text>
                  </View>
                )}
                {beforeItem.error && (
                  <Text style={styles.pairError}>분석 실패: {beforeItem.error}</Text>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        // Normal multi: grid view
        <View style={styles.multiGrid}>
          {images.map((item, idx) => (
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
              <TouchableOpacity style={styles.multiRemoveBtn} onPress={() => removeImage(idx)}>
                <X size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* 경고: 홀수 사진 */}
      {hasOddWarning && (
        <Text style={styles.oddWarning}>전후 비교는 짝수 장이 필요합니다. 마지막 1장은 분석에서 제외됩니다.</Text>
      )}

      {/* 버튼 */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={pickImages}>
          <ImageIcon size={20} color="#fff" />
          <Text style={styles.btnText}>{imageCount > 0 ? `추가 (${imageCount}/${MAX_IMAGES})` : '갤러리'}</Text>
        </TouchableOpacity>
        {!isBeforeAfter && (
          <TouchableOpacity style={styles.iconBtn} onPress={takePhoto}>
            <Camera size={20} color="#fff" /><Text style={styles.btnText}>카메라</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 분석 버튼 */}
      {canAnalyze && (
        <TouchableOpacity style={styles.analyzeBtn} onPress={analyzeFood}>
          <Text style={styles.btnText}>
            AI 분석 시작 ({analysisCount}건)
          </Text>
        </TouchableOpacity>
      )}

      {errorLog && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>알림</Text>
          <Text style={styles.errorText}>{errorLog}</Text>
          <TouchableOpacity onPress={() => setErrorLog(null)} style={{ marginTop: 10 }}>
            <Text style={{ color: '#d32f2f', textAlign: 'right' }}>닫기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 단건 결과 (일반 모드, 1장) */}
      {!isBeforeAfter && imageCount === 1 && images[0].result && (
        <View style={styles.resultCard}>
          <Text style={styles.foodName}>{images[0].result.menu_name}</Text>
          <Text style={styles.diffNote}>
            {photoDate ? `${photoDate} 기록 예정` : `${formatDate(new Date())} (오늘)`}
          </Text>
          <View style={styles.nutrientGrid}>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{images[0].result.kcal}</Text><Text>kcal</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{images[0].result.carbs_g}g</Text><Text>탄수화물</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{images[0].result.protein_g}g</Text><Text>단백질</Text></View>
            <View style={styles.nutrientItem}><Text style={styles.nutrientVal}>{images[0].result.fat_g}g</Text><Text>지방</Text></View>
          </View>
        </View>
      )}

      {/* 저장 버튼 */}
      {hasResults && (
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAll}>
          <Save size={20} color="#fff" />
          <Text style={styles.saveBtnText}>
            {images.filter(i => i.result).length === 1 ? '식단 기록하기' : `${images.filter(i => i.result).length}개 식단 일괄 저장`}
          </Text>
        </TouchableOpacity>
      )}

      <View style={{ marginTop: 30, alignItems: 'center', opacity: 0.3 }}>
        <Text style={{ fontSize: 10 }}>v1.6.0</Text>
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
  modeBtnText: { fontWeight: '600', color: '#666', fontSize: 14 },
  modeBtnTextActive: { color: '#fff' },

  // Placeholder
  placeholder: { width: '100%', height: 200, backgroundColor: '#f0f0f0', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ddd' },
  placeholderText: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Single image
  image: { width: '100%', height: 280, borderRadius: 20 },
  singleOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  singleResultOverlay: { position: 'absolute', bottom: 12, left: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 10, padding: 8, alignItems: 'center' },
  singleResultName: { fontSize: 14, fontWeight: 'bold' },
  singleResultKcal: { fontSize: 12, color: '#007bff' },
  singleRemoveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, padding: 4 },

  // Buttons
  buttonRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  iconBtn: { backgroundColor: '#007bff', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', flex: 0.48, justifyContent: 'center', marginHorizontal: 4 },
  btnText: { color: '#fff', fontWeight: '600', marginLeft: 8 },

  // Multi grid
  multiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  multiItem: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  multiImage: { width: '100%', height: '100%' },
  multiOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.6)' },
  multiResultBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.9)', padding: 4 },
  multiResultText: { fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  multiResultKcal: { fontSize: 9, color: '#007bff', textAlign: 'center' },
  multiRemoveBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 2 },

  // Before/After
  beforeAfterRow: { flexDirection: 'row', justifyContent: 'space-between' },
  slot: { flex: 0.48, position: 'relative' },
  slotLabel: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 6, color: '#555' },
  slotImage: { width: '100%', height: 150, borderRadius: 14 },
  slotPlaceholder: { width: '100%', height: 150, backgroundColor: '#f0f0f0', borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#ddd' },
  slotOverlay: { position: 'absolute', top: 20, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  pairLabel: { fontSize: 13, fontWeight: '600', color: '#007bff', marginBottom: 4 },
  pairResult: { backgroundColor: '#f0f7ff', borderRadius: 10, padding: 10, marginTop: 6 },
  pairResultName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  pairResultInfo: { fontSize: 12, color: '#666', textAlign: 'center', marginTop: 2 },
  pairError: { fontSize: 11, color: '#d32f2f', textAlign: 'center', marginTop: 4 },
  oddWarning: { fontSize: 12, color: '#e67e22', textAlign: 'center', marginBottom: 10 },

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
  nutrientGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, marginTop: 12 },
  nutrientItem: { alignItems: 'center' },
  nutrientVal: { fontSize: 18, fontWeight: 'bold', color: '#007bff' },
  saveBtn: { backgroundColor: '#007bff', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
});
