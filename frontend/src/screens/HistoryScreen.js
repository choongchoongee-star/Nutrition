import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, Image, TouchableOpacity, Alert } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { getMealsByDate, deleteMeal } from '../db/database';
import { formatDate } from '../utils/metadata';
import { Trash2 } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function HistoryScreen() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [meals, setMeals] = useState([]);

  const loadMeals = useCallback(async () => {
    const data = await getMealsByDate(selectedDate);
    setMeals(data);
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      loadMeals();
    }, [loadMeals])
  );

  const handleDelete = (id) => {
    Alert.alert(
      "Delete Meal",
      "Are you sure you want to delete this meal log?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          await deleteMeal(id);
          loadMeals();
        }}
      ]
    );
  };

  const renderMealItem = ({ item }) => (
    <View style={styles.mealItem}>
      {item.image_uri && <Image source={{ uri: item.image_uri }} style={styles.mealImage} />}
      <View style={styles.mealInfo}>
        <Text style={styles.mealType}>{item.meal_type}</Text>
        <Text style={styles.menuName}>{item.menu_name}</Text>
        <Text style={styles.nutrients}>{item.kcal} kcal | C: {item.carbs_g}g P: {item.protein_g}g F: {item.fat_g}g</Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
        <Trash2 size={20} color="#ff4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={(day) => setSelectedDate(day.dateString)}
        markedDates={{
          [selectedDate]: { selected: true, selectedColor: '#007bff' }
        }}
        theme={{
          todayTextColor: '#007bff',
          arrowColor: '#007bff',
        }}
      />
      
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Meals on {selectedDate}</Text>
        <Text style={styles.summaryText}>
          Total: {meals.reduce((sum, m) => sum + m.kcal, 0).toFixed(0)} kcal
        </Text>
      </View>

      <FlatList
        data={meals}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMealItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>No meals logged for this day.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  historyHeader: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryText: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: '600',
  },
  listContainer: {
    padding: 10,
  },
  mealItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  mealImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
  },
  mealInfo: {
    flex: 1,
  },
  mealType: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#888',
    marginBottom: 2,
  },
  menuName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  nutrients: {
    fontSize: 12,
    color: '#666',
  },
  deleteButton: {
    padding: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    color: '#999',
    fontSize: 16,
  },
});
