// screens/AddEventScreen.js
import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../firebase/firebaseConfig';

export default function AddEventScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleAddEvent = async () => {
    if (title === '' || description === '') {
      Alert.alert('Hold up!', 'Please fill in both the title and description.');
      return;
    }

    try {
      await addDoc(collection(db, 'events'), {
        title: title,
        description: description,
        datePosted: new Date().toISOString(),
        postedBy: "Asad Nadeem"
      });
      setTitle('');
      setDescription('');
      navigation.goBack(); 
    } catch (error) {
      Alert.alert('Error', 'Could not connect to Firebase.');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.formCard}>
        <Text style={styles.headerText}>Draft New Notice</Text>
        <Text style={styles.subHeaderText}>Share an upcoming event or announcement with the campus.</Text>

        <Text style={styles.label}>Event Title</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="text-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput 
            style={styles.input} 
            placeholder="e.g. Hackathon 2026" 
            placeholderTextColor="#9CA3AF"
            value={title} 
            onChangeText={setTitle} 
          />
        </View>

        <Text style={styles.label}>Description & Details</Text>
        <View style={[styles.inputContainer, styles.textAreaContainer]}>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            placeholder="Include date, time, location, and important info..." 
            placeholderTextColor="#9CA3AF"
            value={description} 
            onChangeText={setDescription} 
            multiline 
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleAddEvent} activeOpacity={0.8}>
          <Ionicons name="paper-plane-outline" size={20} color="#FFF" />
          <Text style={styles.submitButtonText}>Publish Notice</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', justifyContent: 'center', padding: 20 },
  formCard: { backgroundColor: '#FFF', padding: 25, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 5 },
  headerText: { fontSize: 24, fontWeight: '800', color: '#1F2937', marginBottom: 8 },
  subHeaderText: { fontSize: 14, color: '#6B7280', marginBottom: 30, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#4B5563', marginBottom: 8, marginLeft: 4 },
  
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 },
  inputIcon: { paddingHorizontal: 15 },
  input: { flex: 1, paddingVertical: 16, paddingRight: 15, fontSize: 16, color: '#1F2937' },
  
  textAreaContainer: { paddingLeft: 15 },
  textArea: { height: 120, paddingTop: 16 },
  
  submitButton: { flexDirection: 'row', backgroundColor: '#4F46E5', paddingVertical: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700', marginLeft: 10 },
});