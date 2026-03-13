import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, Image, TouchableOpacity, Alert, Platform } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { getMealsByDate, deleteMeal } from '../db/database';
import { formatDate } from '../utils/metadata';
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react-native';
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

  const handleDelete = async (id) => {
    if (Platform.OS === 'web') {
      if (window.confirm("이 식단 기록을 삭제하시겠습니까?")) {
        await deleteMeal(id);
        loadMeals();
      }
    } else {
      Alert.alert(
        "식단 삭제",
        "이 식단 기록을 삭제하시겠습니까?",
        [
          { text: "취소", style: "cancel" },
          { text: "삭제", style: "destructive", onPress: async () => {
            await deleteMeal(id);
            loadMeals();
          }}
        ]
      );
    }
  };

  const translateMealType = (type) => {
    const types = {
      'Breakfast': '아침',
      'Lunch': '점심',
      'Dinner': '저녁',
      'Snack': '간식'
    };
    return types[type] || type;
  };

  const renderMealItem = ({ item }) => (
    <View style={styles.mealItem}>
      {item.image_uri && <Image source={{ uri: item.image_uri }} style={styles.mealImage} />}
      <View style={styles.mealInfo}>
        <Text style={styles.mealType}>{translateMealType(item.meal_type)}</Text>
        <Text style={styles.menuName}>{item.menu_name}</Text>
        <Text style={styles.nutrients}>{item.kcal} kcal | 탄:{item.carbs_g}g 단:{item.protein_g}g 지:{item.fat_g}g</Text>
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
        renderArrow={(direction) => 
          direction === 'left' ? <ChevronLeft color="#007bff" /> : <ChevronRight color="#007bff" />
        }
        theme={{
          todayTextColor: '#007bff',
          arrowColor: '#007bff',
          calendarBackground: '#f8f9fa',
        }}
      />
      
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>{selectedDate} 식단</Text>
        <Text style={styles.summaryText}>
          총: {meals.reduce((sum, m) => sum + m.kcal, 0).toFixed(0)} kcal
        </Text>
      </View>

      <FlatList
        data={meals}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMealItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>이 날 기록된 식단이 없습니다.</Text>}
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
    backgroundColor: '#fff',
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
