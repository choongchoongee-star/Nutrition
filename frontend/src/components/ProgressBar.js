import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ProgressBar = ({ label, current, target, color }) => {
  const percentage = Math.min((current / target) * 100, 100);
  const displayPercentage = Math.round((current / target) * 100);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {current.toFixed(0)} / {target.toFixed(0)} <Text style={{fontWeight: 'bold'}}>({displayPercentage}%)</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View 
          style={[
            styles.fill, 
            { width: `${percentage}%`, backgroundColor: color }
          ]} 
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  value: {
    fontSize: 14,
    color: '#333',
  },
  track: {
    height: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
});

export default ProgressBar;
