import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { getGoals, updateGoals } from '../db/database';
import { Save } from 'lucide-react-native';

export default function SettingsScreen({ navigation }) {
  const [goals, setGoals] = useState({
    target_kcal: '2000',
    target_carbs: '250',
    target_protein: '60',
    target_fat: '50'
  });

  useEffect(() => {
    const loadGoals = async () => {
      const data = await getGoals();
      if (data) {
        setGoals({
          target_kcal: data.target_kcal.toString(),
          target_carbs: data.target_carbs.toString(),
          target_protein: data.target_protein.toString(),
          target_fat: data.target_fat.toString()
        });
      }
    };
    loadGoals();
  }, []);

  const handleSave = async () => {
    const formattedGoals = {
      target_kcal: parseFloat(goals.target_kcal),
      target_carbs: parseFloat(goals.target_carbs),
      target_protein: parseFloat(goals.target_protein),
      target_fat: parseFloat(goals.target_fat)
    };

    if (Object.values(formattedGoals).some(isNaN)) {
      Alert.alert("오류", "모든 목표 수치에 올바른 숫자를 입력해주세요.");
      return;
    }

    try {
      await updateGoals(formattedGoals);
      Alert.alert("성공", "목표가 업데이트되었습니다!");
      navigation.goBack();
    } catch (error) {
      Alert.alert("오류", "목표 업데이트에 실패했습니다.");
    }
  };

  const renderInput = (label, key, unit) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label} ({unit})</Text>
      <TextInput
        style={styles.input}
        value={goals[key]}
        onChangeText={(text) => setGoals({ ...goals, [key]: text })}
        keyboardType="numeric"
        placeholder={`${label} 입력`}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>일일 목표 설정 🎯</Text>
      <Text style={styles.subtitle}>매일 섭취할 영양소 목표를 설정하여 진행 상황을 추적하세요.</Text>
      
      {renderInput("칼로리", "target_kcal", "kcal")}
      {renderInput("탄수화물", "target_carbs", "g")}
      {renderInput("단백질", "target_protein", "g")}
      {renderInput("지방", "target_fat", "g")}

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
    fontSize: 16,
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
