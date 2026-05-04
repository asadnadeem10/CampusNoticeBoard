// screens/HomeScreen.js
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { db } from '../firebase/firebaseConfig';

// NEW: Importing beautiful built-in icons!
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'events'), (snapshot) => {
      const fetchedEvents = [];
      snapshot.forEach((doc) => {
        fetchedEvents.push({ id: doc.id, ...doc.data() });
      });
      setEvents(fetchedEvents);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (error) {
      console.error("Error deleting document:", error);
    }
  };

  const renderRightActions = (id) => (
    <TouchableOpacity style={styles.deleteAction} onPress={() => handleDelete(id)}>
      <Ionicons name="trash-outline" size={28} color="#FFF" />
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderEvent = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item.id)}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Ionicons name="megaphone" size={20} color="#4F46E5" />
          </View>
          <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={styles.eventDescription}>{item.description}</Text>
        <View style={styles.cardFooter}>
          <Ionicons name="person-circle-outline" size={16} color="#888" />
          <Text style={styles.eventMeta}> {item.postedBy}</Text>
        </View>
      </View>
    </Swipeable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.headerTitle}>Campus Notices</Text>
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-clear-outline" size={60} color="#CCC" />
              <Text style={styles.emptyText}>No events posted yet.</Text>
              <Text style={styles.emptySubText}>Be the first to share an update!</Text>
            </View>
          }
        />
      )}

      {/* Styled Floating Button */}
      <TouchableOpacity 
        style={styles.addButton} 
        activeOpacity={0.8}
        onPress={() => navigation.navigate('AddEvent')}
      >
        <Ionicons name="add" size={24} color="#FFF" />
        <Text style={styles.addButtonText}>Post New Notice</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' }, // Soft off-white background
  topHeader: { paddingHorizontal: 25, paddingTop: 40, paddingBottom: 20, backgroundColor: '#FFF', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 5, zIndex: 10 },
  greeting: { fontSize: 16, color: '#666', marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 20, paddingBottom: 100 },
  
  // Modern Card Styling
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 15, elevation: 4, borderWidth: 1, borderColor: '#F3F4F6' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconContainer: { backgroundColor: '#EEF2FF', padding: 8, borderRadius: 12, marginRight: 12 },
  eventTitle: { fontSize: 19, fontWeight: '700', color: '#1F2937', flex: 1 },
  eventDescription: { fontSize: 15, color: '#4B5563', lineHeight: 22, marginBottom: 15 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12 },
  eventMeta: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  
  // Empty State Styling
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#4B5563', marginTop: 15 },
  emptySubText: { fontSize: 14, color: '#9CA3AF', marginTop: 5 },

  // Swipe Action Styling
  deleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 90, borderRadius: 20, marginBottom: 16, marginLeft: 10, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  deleteText: { color: '#FFF', fontWeight: '700', fontSize: 12, marginTop: 4 },

  // Big Sexy Add Button
  addButton: { flexDirection: 'row', position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: '#4F46E5', paddingVertical: 18, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  addButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700', marginLeft: 8 },
});