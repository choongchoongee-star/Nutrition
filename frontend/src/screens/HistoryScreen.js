import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert, Platform } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { getMealsByDate, deleteMeal, getAllMeals } from '../db/database';
import { formatDate } from '../utils/metadata';
import { Trash2, ChevronLeft, ChevronRight, CalendarDays, List } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function HistoryScreen() {
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'all'
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [meals, setMeals] = useState([]);

  // Pagination state
  const [allMeals, setAllMeals] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const loadMeals = useCallback(async () => {
    const data = await getMealsByDate(selectedDate);
    setMeals(data);
  }, [selectedDate]);

  const loadAllMeals = useCallback(async (p = 1) => {
    const data = await getAllMeals(p, PAGE_SIZE);
    setAllMeals(data.meals);
    setTotal(data.total);
    setPage(p);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (viewMode === 'calendar') {
        loadMeals();
      } else {
        loadAllMeals(page);
      }
    }, [viewMode, loadMeals, loadAllMeals, page])
  );

  const handleDelete = async (id) => {
    if (Platform.OS === 'web') {
      if (window.confirm("이 식단 기록을 삭제하시겠습니까?")) {
        await deleteMeal(id);
        if (viewMode === 'calendar') loadMeals();
        else loadAllMeals(page);
      }
    } else {
      Alert.alert(
        "식단 삭제",
        "이 식단 기록을 삭제하시겠습니까?",
        [
          { text: "취소", style: "cancel" },
          { text: "삭제", style: "destructive", onPress: async () => {
            await deleteMeal(id);
            if (viewMode === 'calendar') loadMeals();
            else loadAllMeals(page);
          }}
        ]
      );
    }
  };

  const translateMealType = (type) => {
    const types = { 'Breakfast': '아침', 'Lunch': '점심', 'Dinner': '저녁', 'Snack': '간식' };
    return types[type] || type;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const renderMealItem = ({ item }) => (
    <View style={styles.mealItem}>
      <View style={styles.mealInfo}>
        {viewMode === 'all' && <Text style={styles.mealDate}>{item.date}</Text>}
        <Text style={styles.mealType}>{translateMealType(item.meal_type)}</Text>
        <Text style={styles.menuName}>{item.menu_name}</Text>
        <Text style={styles.nutrients}>{item.kcal} kcal | 탄:{item.carbs_g}g 단:{item.protein_g}g 지:{item.fat_g}g</Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
        <Trash2 size={20} color="#ff4444" />
      </TouchableOpacity>
    </View>
  );

  const currentMeals = viewMode === 'calendar' ? meals : allMeals;

  return (
    <View style={styles.container}>
      {/* View Mode Toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, viewMode === 'calendar' && styles.modeBtnActive]}
          onPress={() => setViewMode('calendar')}
        >
          <CalendarDays size={16} color={viewMode === 'calendar' ? '#fff' : '#666'} />
          <Text style={[styles.modeBtnText, viewMode === 'calendar' && styles.modeBtnTextActive]}>달력</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, viewMode === 'all' && styles.modeBtnActive]}
          onPress={() => { setViewMode('all'); loadAllMeals(1); }}
        >
          <List size={16} color={viewMode === 'all' ? '#fff' : '#666'} />
          <Text style={[styles.modeBtnText, viewMode === 'all' && styles.modeBtnTextActive]}>전체</Text>
        </TouchableOpacity>
      </View>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <>
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
              총: {meals.reduce((sum, m) => sum + (Number(m.kcal) || 0), 0).toFixed(0)} kcal
            </Text>
          </View>
        </>
      )}

      {/* All View Header */}
      {viewMode === 'all' && (
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>전체 기록</Text>
          <Text style={styles.summaryText}>{total}개</Text>
        </View>
      )}

      {/* Meal List */}
      <FlatList
        data={currentMeals}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMealItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>기록된 식단이 없습니다.</Text>}
      />

      {/* Pagination */}
      {viewMode === 'all' && totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
            onPress={() => page > 1 && loadAllMeals(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft size={18} color={page <= 1 ? '#ccc' : '#007bff'} />
          </TouchableOpacity>
          <Text style={styles.pageText}>{page} / {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
            onPress={() => page < totalPages && loadAllMeals(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight size={18} color={page >= totalPages ? '#ccc' : '#007bff'} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // Mode toggle
  modeToggle: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 12, padding: 4, margin: 10 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  modeBtnActive: { backgroundColor: '#007bff' },
  modeBtnText: { fontWeight: '600', color: '#666' },
  modeBtnTextActive: { color: '#fff' },

  // Header
  historyHeader: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' },
  historyTitle: { fontSize: 16, fontWeight: 'bold' },
  summaryText: { fontSize: 14, color: '#007bff', fontWeight: '600' },

  // List
  listContainer: { padding: 10 },
  mealItem: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  mealInfo: { flex: 1 },
  mealDate: { fontSize: 11, color: '#007bff', fontWeight: '600', marginBottom: 2 },
  mealType: { fontSize: 12, fontWeight: 'bold', color: '#888', marginBottom: 2 },
  menuName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  nutrients: { fontSize: 12, color: '#666' },
  deleteButton: { padding: 10 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16 },

  // Pagination
  pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  pageBtn: { padding: 8, borderRadius: 8, backgroundColor: '#f0f0f0', marginHorizontal: 20 },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: 14, fontWeight: '600', color: '#333' },
});
