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
      Alert.alert("Error", "Please enter valid numbers for all goals.");
      return;
    }

    try {
      await updateGoals(formattedGoals);
      Alert.alert("Success", "Goals updated successfully!");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", "Failed to update goals.");
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
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Set Daily Goals 🎯</Text>
      <Text style={styles.subtitle}>Define your daily nutrient targets to track your progress.</Text>
      
      {renderInput("Calories", "target_kcal", "kcal")}
      {renderInput("Carbohydrates", "target_carbs", "g")}
      {renderInput("Protein", "target_protein", "g")}
      {renderInput("Fat", "target_fat", "g")}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Save size={20} color="#fff" />
        <Text style={styles.saveButtonText}>Save Goals</Text>
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
