import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { getGoals, updateGoals } from '../db/database';
import { Save } from 'lucide-react-native';

const calcKcal = (carbs, protein, fat) => {
  const c = parseFloat(carbs) || 0;
  const p = parseFloat(protein) || 0;
  const f = parseFloat(fat) || 0;
  return Math.round(c * 4 + p * 4 + f * 9);
};

export default function SettingsScreen({ navigation }) {
  const [goals, setGoals] = useState({
    target_carbs: '250',
    target_protein: '60',
    target_fat: '50'
  });

  useEffect(() => {
    const loadGoals = async () => {
      const data = await getGoals();
      if (data) {
        setGoals({
          target_carbs: data.target_carbs.toString(),
          target_protein: data.target_protein.toString(),
          target_fat: data.target_fat.toString()
        });
      }
    };
    loadGoals();
  }, []);

  const autoKcal = calcKcal(goals.target_carbs, goals.target_protein, goals.target_fat);

  const handleSave = async () => {
    const formattedGoals = {
      target_kcal: autoKcal,
      target_carbs: parseFloat(goals.target_carbs),
      target_protein: parseFloat(goals.target_protein),
      target_fat: parseFloat(goals.target_fat)
    };

    if ([formattedGoals.target_carbs, formattedGoals.target_protein, formattedGoals.target_fat].some(isNaN)) {
      if (Platform.OS === 'web') {
        window.alert("모든 목표 수치에 올바른 숫자를 입력해주세요.");
      } else {
        Alert.alert("오류", "모든 목표 수치에 올바른 숫자를 입력해주세요.");
      }
      return;
    }

    try {
      await updateGoals(formattedGoals);
      if (Platform.OS === 'web') {
        window.alert("목표가 업데이트되었습니다!");
      } else {
        Alert.alert("성공", "목표가 업데이트되었습니다!");
      }
      navigation.goBack();
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert("목표 업데이트에 실패했습니다.");
      } else {
        Alert.alert("오류", "목표 업데이트에 실패했습니다.");
      }
    }
  };

  const handleChange = (key, text) => {
    setGoals({ ...goals, [key]: text });
  };

  const renderInput = (label, key, unit) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label} ({unit})</Text>
      <TextInput
        style={styles.input}
        value={goals[key]}
        onChangeText={(text) => handleChange(key, text)}
        keyboardType="numeric"
        placeholder={`${label} 입력`}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>일일 목표 설정</Text>
      <Text style={styles.subtitle}>탄수화물, 단백질, 지방을 입력하면 칼로리가 자동 계산됩니다.</Text>

      {renderInput("탄수화물", "target_carbs", "g")}
      {renderInput("단백질", "target_protein", "g")}
      {renderInput("지방", "target_fat", "g")}

      <View style={styles.kcalCard}>
        <Text style={styles.kcalLabel}>목표 칼로리 (자동 계산)</Text>
        <Text style={styles.kcalValue}>{autoKcal} kcal</Text>
        <Text style={styles.kcalFormula}>탄수화물x4 + 단백질x4 + 지방x9</Text>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Save size={20} color="#fff" />
        <Text style={styles.saveButtonText}>목표 저장하기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 30,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  kcalCard: {
    backgroundColor: '#f0f7ff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d0e3ff',
  },
  kcalLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  kcalValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007bff',
  },
  kcalFormula: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 10,
  },
});
