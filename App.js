import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput, TouchableOpacity,
  UIManager,
  View
} from 'react-native';
import { SwipeListView } from 'react-native-swipe-list-view';
import { db } from './firebaseConfig';

import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AVATAR_COLORS = [
  '#000000', // Noir
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#14B8A6', // Teal
];

export default function App() {
  const [activeTab, setActiveTab] = useState('feed'); 
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true); 
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All'); 
  const [savedNotices, setSavedNotices] = useState([]); 
  const [selectedNotice, setSelectedNotice] = useState(null); 
  const [refreshing, setRefreshing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true); 
  
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [toastAnim] = useState(new Animated.Value(-100));
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  
  const [userName, setUserName] = useState('');
  const [tempName, setTempName] = useState('');
  const [password, setPassword] = useState(''); 
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState(null); 
  const [isAdmin, setIsAdmin] = useState(false);
  const [userColor, setUserColor] = useState(AVATAR_COLORS[1]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const navAnimFeed = useRef(new Animated.Value(1)).current;
  const navAnimProfile = useRef(new Animated.Value(1)).current;
  const listRef = useRef(null); 

  const theme = isDarkMode ? {
    bg: '#000000', surface: '#0A0A0A', card: '#141414', text: '#FFFFFF', subText: '#888888', 
    border: '#222222', primary: userColor, accent: '#8B5CF6', danger: '#EF4444', warning: '#F59E0B'
  } : {
    bg: '#F4F5F7', surface: '#FFFFFF', card: '#FFFFFF', text: '#0F172A', subText: '#64748B', 
    border: '#E2E8F0', primary: userColor, accent: '#7C3AED', danger: '#DC2626', warning: '#D97706'
  };

  useEffect(() => {
    loadLocalData();
    registerForPushNotificationsAsync();
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      ])
    ).start();

    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const noticesData = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(), likedBy: doc.data().likedBy || [], isPinned: doc.data().isPinned || false
      }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNotices(noticesData);
      setIsLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  async function registerForPushNotificationsAsync() {
    let token;
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') finalStatus = (await Notifications.requestPermissionsAsync()).status;
      if (finalStatus !== 'granted') return;
      token = (await Notifications.getExpoPushTokenAsync({ projectId: "your-expo-project-id-here" })).data;
      if (token) await setDoc(doc(db, 'pushTokens', token), { token: token, createdAt: serverTimestamp() }, { merge: true });
    }
  }

  const loadLocalData = async () => {
    const storedName = await AsyncStorage.getItem('@user_name');
    const storedRole = await AsyncStorage.getItem('@user_role');
    const storedTheme = await AsyncStorage.getItem('@dark_mode');
    const storedSaves = await AsyncStorage.getItem('@saved_notices');
    const storedColor = await AsyncStorage.getItem('@user_color'); 
    
    if (storedName) {
      setUserName(storedName);
      setIsAdmin(storedRole === 'admin');
    } else {
      setShowAuthModal(true);
    }
    if (storedTheme !== null) setIsDarkMode(JSON.parse(storedTheme));
    if (storedSaves !== null) setSavedNotices(JSON.parse(storedSaves));
    if (storedColor !== null) setUserColor(storedColor);
  };

  const changeUserColor = async (color) => {
    Haptics.selectionAsync();
    setUserColor(color);
    await AsyncStorage.setItem('@user_color', color);
  };

  const handleFilterSelect = (filter) => {
    Haptics.selectionAsync();
    setActiveFilter(filter);
    if (listRef.current) listRef.current.scrollToOffset({ offset: 0, animated: true });
  };

  // --------------------------------------------------------
  // THE BUG FIX: Re-adding the missing timeAgo function
  // --------------------------------------------------------
  const timeAgo = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'Just now';
    const seconds = Math.floor((new Date() - timestamp.toDate()) / 1000);
    if (seconds / 86400 > 1) return Math.floor(seconds / 86400) + 'd ago';
    if (seconds / 3600 > 1) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds / 60 > 1) return Math.floor(seconds / 60) + 'm ago';
    return 'Just now';
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const calculateReadTime = (text) => {
    if (!text) return '1 min read'; 
    const words = text.trim().split(/\s+/).length;
    const time = Math.ceil(words / 200); 
    return `${time} min read`;
  };

  const handleLogin = async () => {
    const enteredName = tempName.trim().toUpperCase();
    if (enteredName === '') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return showToast('Please enter your identity.', 'error');
    }

    if (authMode === 'admin') {
      if (password.trim() === '') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return showToast('Password is required.', 'error');
      }

      let isValidAdmin = false;
      if (enteredName === 'ASAD' && password === '15072003') isValidAdmin = true;
      if (enteredName === 'MUTARF' && password === '17092005') isValidAdmin = true;

      if (isValidAdmin) {
        await AsyncStorage.setItem('@user_role', 'admin');
        setIsAdmin(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('Admin Protocol Verified');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return showToast('Invalid Admin Credentials', 'error');
      }
    } else {
      await AsyncStorage.setItem('@user_role', 'student');
      setIsAdmin(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Welcome, ${tempName.trim()}`);
    }

    await AsyncStorage.setItem('@user_name', enteredName);
    setUserName(enteredName);
    setShowAuthModal(false);
    setPassword(''); 
  };

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    Animated.spring(toastAnim, { toValue: Platform.OS === 'ios' ? 60 : 40, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(toastAnim, { toValue: -100, duration: 300, useNativeDriver: true }).start(() => setToast({ visible: false, message: '', type: 'success' }));
    }, 3000);
  };

  const animateTab = (animRef) => {
    animRef.setValue(0.8);
    Animated.spring(animRef, { toValue: 1, friction: 4, tension: 50, useNativeDriver: true }).start();
  };

  const switchTab = (tab) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    if (tab === 'feed') animateTab(navAnimFeed);
    if (tab === 'profile') animateTab(navAnimProfile);
  };

  const toggleBookmark = async (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
    const newSaves = savedNotices.includes(id) ? savedNotices.filter(saveId => saveId !== id) : [...savedNotices, id];
    setSavedNotices(newSaves);
    await AsyncStorage.setItem('@saved_notices', JSON.stringify(newSaves));
    showToast(savedNotices.includes(id) ? 'Removed from Bookmarks' : 'Saved to Bookmarks');
  };

  const togglePin = async (item) => {
    if (!isAdmin) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await updateDoc(doc(db, 'notices', item.id), { isPinned: !item.isPinned });
    showToast(item.isPinned ? 'Notice Unpinned' : 'Notice Pinned to Top!');
  };

  const publishNotice = async () => {
    if (!isAdmin) return;
    if (title.trim() === '' || description.trim() === '') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return showToast('Fill all fields.', 'error');
    }
    try {
      await addDoc(collection(db, 'notices'), { title, description, category, author: userName, likedBy: [], isPinned: false, createdAt: serverTimestamp() });
      sendPushNotification(title, category);
      setTitle(''); setDescription(''); setActiveTab('feed'); setActiveFilter('All');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Notice published & notified securely!');
    } catch (error) { showToast('Could not publish.', 'error'); }
  };

  const deleteNotice = async (id) => {
    if (!isAdmin) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await deleteDoc(doc(db, 'notices', id));
    showToast('Notice permanently deleted.', 'error');
  };

  const likeNotice = async (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
    const noticeRef = doc(db, 'notices', item.id);
    const hasLiked = item.likedBy.includes(userName);
    await updateDoc(noticeRef, { likedBy: hasLiked ? arrayRemove(userName) : arrayUnion(userName) });
  };

  let lastTap = null;
  const handleCardPress = (item) => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (lastTap && (now - lastTap) < DOUBLE_PRESS_DELAY) {
      likeNotice(item); 
    } else {
      lastTap = now;
      setTimeout(() => {
        if(Date.now() - lastTap >= DOUBLE_PRESS_DELAY) {
          Haptics.selectionAsync(); 
          setSelectedNotice(item); 
        }
      }, DOUBLE_PRESS_DELAY);
    }
  };

  const shareNotice = async (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = `🎓 *GCUF OFFICIAL NOTICE* 🎓\n━━━━━━━━━━━━━━━━━━━━━━\n📢 *${item.title}*\n📑 Category: ${item.category}\n\n${item.description}\n\n━━━━━━━━━━━━━━━━━━━━━━\n📱 *Shared via GCUF Connect App*`;
    try { await Share.share({ message }); } catch (error) {}
  };

  let processedNotices = notices.filter(notice => {
    const matchesSearch = notice.title.toLowerCase().includes(searchQuery.toLowerCase()) || notice.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'All' || notice.category === activeFilter;
    const matchesBookmarks = activeFilter === 'Saved' ? savedNotices.includes(notice.id) : true;
    return matchesSearch && matchesFilter && matchesBookmarks;
  });

  processedNotices.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  const headerHeight = scrollY.interpolate({ inputRange: [0, 80], outputRange: [Platform.OS === 'ios' ? 140 : 120, Platform.OS === 'ios' ? 100 : 80], extrapolate: 'clamp' });
  const headerOpacity = scrollY.interpolate({ inputRange: [0, 40], outputRange: [1, 0], extrapolate: 'clamp' });
  const compactTitleOpacity = scrollY.interpolate({ inputRange: [40, 80], outputRange: [0, 1], extrapolate: 'clamp' });

  const renderSkeleton = () => (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, opacity: 0.4 }]}>
      <View style={styles.cardHeader}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <View style={[styles.avatar, {backgroundColor: theme.border}]} />
          <View>
            <View style={{width: 100, height: 16, backgroundColor: theme.border, borderRadius: 6, marginBottom: 8}} />
            <View style={{width: 60, height: 12, backgroundColor: theme.border, borderRadius: 6}} />
          </View>
        </View>
      </View>
      <View style={{width: '85%', height: 24, backgroundColor: theme.border, borderRadius: 6, marginBottom: 16}} />
      <View style={{width: '100%', height: 16, backgroundColor: theme.border, borderRadius: 6, marginBottom: 8}} />
      <View style={{width: '90%', height: 16, backgroundColor: theme.border, borderRadius: 6}} />
    </View>
  );

  const renderNotice = (data) => {
    const item = data.item;
    let catColor = theme.primary; let catIcon = 'megaphone';
    if (item.category === 'Urgent') { catColor = theme.danger; catIcon = 'alert-circle'; }
    if (item.category === 'Event') { catColor = '#10B981'; catIcon = 'calendar'; }
    
    const likeCount = item.likedBy ? item.likedBy.length : 0;
    const hasLiked = item.likedBy && item.likedBy.includes(userName);
    const isSaved = savedNotices.includes(item.id);
    const isPostAdmin = item.author === 'ASAD' || item.author === 'MUTARF';
    const isMyPost = item.author === userName;

    return (
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: item.isPinned ? theme.warning : theme.border, borderWidth: item.isPinned ? 1.5 : 1 }]}>
        <Pressable onPress={() => handleCardPress(item)} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); toggleBookmark(item.id); }}>
          <View style={styles.cardHeader}>
            <View style={styles.authorRow}>
              <View style={[styles.avatar, {backgroundColor: isMyPost ? theme.primary : (isPostAdmin ? '#8B5CF6' : theme.border)}]}>
                <Text style={{color: '#fff', fontWeight: '800', fontSize: 18}}>{item.author ? item.author.charAt(0) : 'A'}</Text>
              </View>
              <View>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Text style={[styles.cardAuthor, {color: theme.text}]}>{item.author}</Text>
                  {isPostAdmin && <Ionicons name="checkmark-circle" size={16} color="#8B5CF6" style={{marginLeft: 4}} />}
                </View>
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                  {item.isPinned && <Ionicons name="pin" size={12} color={theme.warning} style={{marginRight: 4}} />}
                  <Text style={{color: theme.subText, fontSize: 13, fontWeight: '600'}}>{timeAgo(item.createdAt)}</Text>
                  <Text style={{color: theme.subText, fontSize: 13, fontWeight: '600', marginHorizontal: 6}}>•</Text>
                  <Text style={{color: theme.subText, fontSize: 13, fontWeight: '600'}}>{calculateReadTime(item.description)}</Text>
                </View>
              </View>
            </View>
            <Animated.View style={[styles.badge, { backgroundColor: catColor + '15' }, item.category === 'Urgent' && { opacity: pulseAnim }]}>
              <Ionicons name={catIcon} size={14} color={catColor} style={{marginRight: 4}} />
              <Text style={[styles.badgeText, {color: catColor}]}>{item.category}</Text>
            </Animated.View>
          </View>

          <Text style={[styles.cardTitle, {color: theme.text}]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.cardDesc, {color: theme.subText}]} numberOfLines={3}>{item.description}</Text>
        </Pressable>

        <View style={[styles.cardFooter, {borderColor: theme.border}]}>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => likeNotice(item)}>
              <Ionicons name={hasLiked ? "heart" : "heart-outline"} size={26} color={hasLiked ? theme.danger : theme.subText} />
              <Text style={[styles.actionText, hasLiked ? {color: theme.danger} : {color: theme.subText}]}>{likeCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => shareNotice(item)}>
              <Ionicons name="share-social-outline" size={24} color={theme.subText} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.actionRow}>
            {isAdmin && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => togglePin(item)}>
                <Ionicons name={item.isPinned ? "pin" : "pin-outline"} size={26} color={item.isPinned ? theme.warning : theme.subText} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionBtn} onPress={() => toggleBookmark(item.id)}>
              <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={26} color={isSaved ? theme.primary : theme.subText} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderHiddenItem = (data) => {
    return (
      <View style={styles.hiddenCardContainer}>
        <View style={{flex: 1}} /> 
        {isAdmin && (
          <TouchableOpacity style={[styles.hiddenBtn, {backgroundColor: theme.danger}]} onPress={() => deleteNotice(data.item.id)}>
            <Ionicons name="trash" size={30} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.bg}]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      
      {toast.visible && (
        <Animated.View style={[styles.toast, { transform: [{ translateY: toastAnim }], backgroundColor: toast.type === 'error' ? theme.danger : theme.primary }]}>
          <Ionicons name={toast.type === 'error' ? "warning" : "checkmark-circle"} size={24} color="#fff" />
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      )}

      {/* SECURE AUTH MODAL */}
      <Modal visible={showAuthModal} animationType="slide" transparent={false}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.authContainer, {backgroundColor: theme.bg}]}>
          <View style={[styles.iconBlur, {backgroundColor: theme.primary + '15'}]}>
             <Ionicons name="finger-print" size={80} color={theme.primary} />
          </View>
          <Text style={[styles.authTitle, {color: theme.text}]}>GCUF Connect</Text>
          <Text style={[styles.authSub, {color: theme.subText}]}>Secure Campus Network</Text>

          {!authMode ? (
            <View style={{width: '100%', marginTop: 50}}>
              <TouchableOpacity style={[styles.authRoleBtn, {backgroundColor: theme.surface, borderColor: theme.border}]} onPress={() => { Haptics.selectionAsync(); setAuthMode('student'); }}>
                <Ionicons name="school" size={26} color={theme.primary} />
                <Text style={[styles.authRoleText, {color: theme.text}]}>Student Portal</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.subText} />
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.authRoleBtn, {backgroundColor: theme.surface, borderColor: theme.border, marginTop: 15}]} onPress={() => { Haptics.selectionAsync(); setAuthMode('admin'); }}>
                <Ionicons name="shield-checkmark" size={26} color={theme.accent} />
                <Text style={[styles.authRoleText, {color: theme.text}]}>Administrator Login</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.subText} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{width: '100%', marginTop: 40}}>
              <TextInput style={[styles.authInput, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, marginBottom: authMode === 'admin' ? 15 : 20}]} placeholder={authMode === 'admin' ? "Administrator ID" : "Enter Full Name"} placeholderTextColor={theme.subText} value={tempName} onChangeText={setTempName} autoCapitalize="characters" />
              
              {authMode === 'admin' && (
                <View style={[styles.passwordContainer, {backgroundColor: theme.surface, borderColor: theme.border}]}>
                  <Ionicons name="lock-closed" size={20} color={theme.subText} style={{marginLeft: 20}} />
                  <TextInput style={[styles.passwordInput, {color: theme.text}]} placeholder="Enter Security Pin" placeholderTextColor={theme.subText} value={password} onChangeText={setPassword} secureTextEntry={true} keyboardType="numeric" />
                </View>
              )}

              <TouchableOpacity style={[styles.authSubmitBtn, {backgroundColor: authMode === 'admin' ? theme.accent : theme.primary}]} onPress={handleLogin}>
                <Text style={styles.authSubmitText}>Authenticate</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={{marginTop: 30, alignItems: 'center', padding: 10}} onPress={() => { Haptics.selectionAsync(); setAuthMode(null); setTempName(''); setPassword(''); }}>
                <Text style={{color: theme.subText, fontWeight: '700', fontSize: 16}}>Cancel & Go Back</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* READING MODAL */}
      <Modal visible={!!selectedNotice} animationType="fade" transparent={true}>
        <BlurView intensity={isDarkMode ? 80 : 60} tint={isDarkMode ? "dark" : "light"} style={styles.expandedOverlay}>
          <View style={{flexDirection: 'row', justifyContent: 'flex-end', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 25}}>
            <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setSelectedNotice(null); }}>
              <View style={{backgroundColor: theme.card, padding: 10, borderRadius: 25}}>
                <Ionicons name="close" size={28} color={theme.text} />
              </View>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{padding: 25, paddingTop: 10}}>
            <View style={[styles.badge, { backgroundColor: theme.primary+'20', alignSelf: 'flex-start', marginBottom: 20, paddingHorizontal: 16, paddingVertical: 8 }]}>
              <Text style={[styles.badgeText, {color: theme.primary, fontSize: 13}]}>{selectedNotice?.category}</Text>
            </View>
            <Text style={[styles.expandedTitle, {color: theme.text}]}>{selectedNotice?.title}</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 35, borderBottomWidth: 1, borderColor: theme.border, paddingBottom: 25}}>
              <View style={[styles.avatar, {backgroundColor: theme.surface, width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: theme.border}]}><Text style={{color: theme.text, fontWeight: '900', fontSize: 20}}>{selectedNotice?.author.charAt(0)}</Text></View>
              <View style={{marginLeft: 15}}>
                <Text style={{color: theme.text, fontWeight: '800', fontSize: 18}}>{selectedNotice?.author}</Text>
                <Text style={{color: theme.subText, marginTop: 4, fontWeight: '600'}}>{timeAgo(selectedNotice?.createdAt)} • {calculateReadTime(selectedNotice?.description)}</Text>
              </View>
            </View>
            <Text style={[styles.expandedDesc, {color: theme.text}]}>{selectedNotice?.description}</Text>
          </ScrollView>
        </BlurView>
      </Modal>

      {/* HEADER */}
      {activeTab === 'feed' ? (
        <Animated.View style={[styles.header, { backgroundColor: theme.surface, height: headerHeight, zIndex: 10 }]}>
          <Animated.View style={{ opacity: headerOpacity }}>
            <Text style={{color: theme.subText, fontSize: 15, fontWeight: '800', letterSpacing: 0.5}}>{getGreeting()},</Text>
            <Text style={[styles.headerTitle, {color: theme.text}]}>{userName ? userName.split(' ')[0] : 'Student'}</Text>
          </Animated.View>
          
          <Animated.View style={{position: 'absolute', bottom: 20, left: 25, opacity: compactTitleOpacity}}>
             <Text style={{color: theme.text, fontSize: 22, fontWeight: '900'}}>Campus Board</Text>
          </Animated.View>

          <TouchableOpacity onPress={() => switchTab('profile')}>
            <View style={[styles.headerAvatar, {backgroundColor: theme.primary}]}>
              <Text style={{color: '#fff', fontWeight: '900', fontSize: 20}}>{userName.charAt(0)}</Text>
              {isAdmin && <View style={styles.adminDot} />}
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={[styles.staticHeader, {backgroundColor: theme.surface}]}>
          <Text style={{color: theme.text, fontSize: 28, fontWeight: '900'}}>{activeTab === 'publish' ? 'New Broadcast' : 'Your Profile'}</Text>
        </View>
      )}

      {/* FEED TAB */}
      {activeTab === 'feed' && (
        <View style={styles.screenContainer}>
          {isLoading ? (
            <View style={{paddingHorizontal: 20, paddingTop: 20}}>
              {renderSkeleton()}{renderSkeleton()}
            </View>
          ) : (
            <SwipeListView
              ref={listRef} 
              data={processedNotices}
              keyExtractor={(item) => item.id}
              renderItem={renderNotice}
              renderHiddenItem={renderHiddenItem}
              rightOpenValue={isAdmin ? -90 : 0} 
              disableRightSwipe={true}
              initialNumToRender={5}
              maxToRenderPerBatch={5}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 140, paddingTop: 10}} // Added heavy padding for floating nav
              
              onScroll={Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {useNativeDriver: false})}
              scrollEventThrottle={16}
              
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRefreshing(true); setTimeout(() => setRefreshing(false), 1000);}} tintColor={theme.primary} />}
              
              ListHeaderComponent={
                <View>
                  <View style={[styles.searchContainer, {backgroundColor: theme.surface, borderColor: theme.border}]}>
                    <Ionicons name="search" size={22} color={theme.subText} style={{marginRight: 10}} />
                    <TextInput style={[styles.searchInput, {color: theme.text}]} placeholder="Search updates..." placeholderTextColor={theme.subText} value={searchQuery} onChangeText={setSearchQuery} />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {['All', 'General', 'Urgent', 'Event', 'Saved'].map(filter => (
                      <TouchableOpacity key={filter} style={[styles.filterChip, {backgroundColor: theme.surface, borderColor: theme.border}, activeFilter === filter && {backgroundColor: theme.primary, borderColor: theme.primary}]} onPress={() => handleFilterSelect(filter)}>
                        <Text style={[styles.filterChipText, {color: theme.subText}, activeFilter === filter && {color: '#fff'}]}>{filter}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* PUBLISH TAB */}
      {activeTab === 'publish' && isAdmin && (
        <ScrollView style={styles.screenContainer} contentContainerStyle={{padding: 25, paddingBottom: 140}}>
          <Text style={{color: theme.subText, marginBottom: 30, fontSize: 16, lineHeight: 24}}>Notifications will be securely pushed to all campus devices on the GCUF network.</Text>
          <TextInput style={[styles.input, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border}]} placeholder="Enter Headline..." placeholderTextColor={theme.subText} value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, {height: 200, textAlignVertical: 'top', backgroundColor: theme.surface, color: theme.text, borderColor: theme.border}]} placeholder="Write complete details here..." placeholderTextColor={theme.subText} multiline value={description} onChangeText={setDescription} />
          
          <Text style={[styles.subLabel, {color: theme.text}]}>Priority Level</Text>
          <View style={styles.categoryRow}>
            {['General', 'Event', 'Urgent'].map((cat) => {
               const isActive = category === cat;
               let activeColor = theme.primary;
               if(cat === 'Urgent') activeColor = theme.danger;
               if(cat === 'Event') activeColor = '#10B981';

               return (
                 <TouchableOpacity key={cat} style={[styles.catBtn, {backgroundColor: theme.surface, borderColor: theme.border}, isActive && {backgroundColor: activeColor+'15', borderColor: activeColor}]} onPress={() => { Haptics.selectionAsync(); setCategory(cat); }}>
                   <Text style={[{color: theme.subText, fontWeight: '800'}, isActive && {color: activeColor}]}>{cat}</Text>
                 </TouchableOpacity>
               )
            })}
          </View>
          
          <TouchableOpacity style={[styles.publishBtn, {backgroundColor: theme.accent}]} onPress={publishNotice}>
            <Ionicons name="paper-plane" size={24} color="#fff" style={{marginRight: 10}} />
            <Text style={styles.publishBtnText}>Dispatch Notice</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <ScrollView style={styles.screenContainer} contentContainerStyle={{padding: 25, alignItems: 'center', paddingBottom: 140}}>
          <View style={[styles.bigAvatar, {backgroundColor: theme.primary}]}>
            <Text style={styles.bigAvatarText}>{userName.charAt(0)}</Text>
          </View>
          
          <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 20}}>
            <Text style={[styles.profileName, {color: theme.text}]}>{userName}</Text>
            {isAdmin && <Ionicons name="shield-checkmark" size={30} color="#8B5CF6" style={{marginLeft: 10}} />}
          </View>
          <Text style={{color: isAdmin ? '#8B5CF6' : theme.subText, fontSize: 15, fontWeight: '800', marginBottom: 40, letterSpacing: 2, textTransform: 'uppercase'}}>
            {isAdmin ? 'System Administrator' : 'Verified Student'}
          </Text>

          <View style={[styles.themeToggleCard, {backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'column', alignItems: 'flex-start'}]}>
            <Text style={{color: theme.text, fontWeight: '800', fontSize: 17, marginBottom: 20}}>Profile Color Theme</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 5}}>
              {AVATAR_COLORS.map((color) => (
                <TouchableOpacity 
                  key={color} 
                  onPress={() => changeUserColor(color)}
                  style={[styles.colorSwatch, {backgroundColor: color, borderColor: theme.text, borderWidth: userColor === color ? 3 : 0}]}
                >
                  {userColor === color && <Ionicons name="checkmark" size={20} color="#fff" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.themeToggleCard, {backgroundColor: theme.surface, borderColor: theme.border}]}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Ionicons name={isDarkMode ? "moon" : "sunny"} size={28} color={isDarkMode ? theme.accent : theme.warning} />
              <Text style={{color: theme.text, fontWeight: '800', fontSize: 18, marginLeft: 15}}>Dark Appearance</Text>
            </View>
            <Switch value={isDarkMode} onValueChange={() => { Haptics.selectionAsync(); setIsDarkMode(!isDarkMode); AsyncStorage.setItem('@dark_mode', JSON.stringify(!isDarkMode));}} trackColor={{ false: theme.border, true: theme.primary }} thumbColor={"#fff"} />
          </View>
          
          <View style={[styles.statsRow, {backgroundColor: theme.surface, borderColor: theme.border}]}>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, {color: theme.text}]}>{savedNotices.length}</Text>
              <Text style={[styles.statLabel, {color: theme.subText}]}>Bookmarks</Text>
            </View>
            <View style={[styles.statBox, {borderLeftWidth: 1, borderRightWidth: isAdmin ? 1 : 0, borderColor: theme.border}]}>
              <Text style={[styles.statNumber, {color: theme.text}]}>{notices.filter(n => n.likedBy.includes(userName)).length}</Text>
              <Text style={[styles.statLabel, {color: theme.subText}]}>Interactions</Text>
            </View>
            {isAdmin && (
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, {color: theme.accent}]}>{notices.filter(n => n.author === userName).length}</Text>
                <Text style={[styles.statLabel, {color: theme.accent}]}>Broadcasts</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={{marginTop: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, paddingVertical: 18, paddingHorizontal: 35, borderRadius: 30, borderWidth: 1, borderColor: theme.border}} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); AsyncStorage.clear(); setUserName(''); setShowAuthModal(true); setPassword(''); setTempName(''); }}>
            <Ionicons name="log-out-outline" size={24} color={theme.danger} />
            <Text style={{color: theme.danger, fontSize: 17, fontWeight: '800', marginLeft: 12}}>Sign Out Session</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* NEW: BILLION DOLLAR FLOATING PILL NAV */}
      <View style={[styles.floatingNavContainer, { shadowColor: isDarkMode ? '#000' : '#888' }]}>
        <BlurView intensity={isDarkMode ? 50 : 80} tint={isDarkMode ? "dark" : "light"} style={[styles.floatingNav, {backgroundColor: isDarkMode ? 'rgba(20,20,20,0.85)' : 'rgba(255,255,255,0.85)', borderColor: theme.border}]}>
          <TouchableOpacity style={styles.navTab} onPress={() => switchTab('feed')}>
            <Animated.View style={{ transform: [{ scale: navAnimFeed }] }}>
              {notices.length > 0 && activeTab !== 'feed' && (
                <View style={{position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.danger, borderWidth: 2, borderColor: theme.surface, zIndex: 10}} />
              )}
              <Ionicons name={activeTab === 'feed' ? "home" : "home-outline"} size={28} color={activeTab === 'feed' ? theme.primary : theme.subText} />
            </Animated.View>
          </TouchableOpacity>
          
          {isAdmin && (
            <TouchableOpacity style={styles.navTab} onPress={() => switchTab('publish')}>
              <View style={[styles.publishNavBtn, {backgroundColor: theme.accent}]}>
                <Ionicons name="add" size={32} color="#fff" />
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.navTab} onPress={() => switchTab('profile')}>
            <Animated.View style={{ transform: [{ scale: navAnimProfile }] }}>
              <Ionicons name={activeTab === 'profile' ? "person" : "person-outline"} size={28} color={activeTab === 'profile' ? theme.primary : theme.subText} />
            </Animated.View>
          </TouchableOpacity>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  iconBlur: { padding: 30, borderRadius: 40, marginBottom: 30 },
  authTitle: { fontSize: 44, fontWeight: '900', letterSpacing: -1.5 },
  authSub: { fontSize: 18, marginTop: 10, fontWeight: '600' },
  authRoleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, borderRadius: 28, borderWidth: 1, width: '100%' },
  authRoleText: { fontSize: 20, fontWeight: '800', flex: 1, marginLeft: 15 },
  authInput: { padding: 24, borderRadius: 28, fontSize: 18, borderWidth: 1, width: '100%', fontWeight: '700' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 28, width: '100%', marginBottom: 35 },
  passwordInput: { flex: 1, padding: 24, fontSize: 18, fontWeight: '700' },
  authSubmitBtn: { padding: 24, borderRadius: 28, alignItems: 'center', width: '100%', elevation: 4 },
  authSubmitText: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 25, paddingBottom: 25 },
  staticHeader: { paddingTop: Platform.OS === 'ios' ? 80 : 60, paddingHorizontal: 25, paddingBottom: 25, borderBottomWidth: 1, borderColor: '#333' },
  headerTitle: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, marginTop: 4 },
  headerAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', position: 'absolute', right: 25, bottom: 25, elevation: 5 },
  adminDot: { position: 'absolute', right: 0, bottom: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#10B981', borderWidth: 3, borderColor: '#000' },
  
  screenContainer: { flex: 1 },
  toast: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 20, right: 20, padding: 22, borderRadius: 28, flexDirection: 'row', alignItems: 'center', zIndex: 1000, elevation: 10 },
  toastText: { color: '#fff', fontWeight: '800', fontSize: 17, marginLeft: 15 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 15, paddingHorizontal: 20, borderRadius: 28, borderWidth: 1 },
  searchInput: { flex: 1, paddingVertical: 20, fontSize: 17, fontWeight: '600' },
  chipScroll: { maxHeight: 55, marginBottom: 25 },
  filterChip: { paddingHorizontal: 28, justifyContent: 'center', borderRadius: 28, marginRight: 12, borderWidth: 1, height: 50 },
  filterChipText: { fontWeight: '800', fontSize: 15 },

  // NEW: Ultra-soft shadow cards
  card: { padding: 26, borderRadius: 35, marginBottom: 25, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardAuthor: { fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  badgeText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  cardTitle: { fontSize: 26, fontWeight: '900', marginBottom: 14, letterSpacing: -0.5, lineHeight: 32 },
  cardDesc: { fontSize: 18, lineHeight: 30, marginBottom: 25 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 20 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingRight: 25 },
  actionText: { marginLeft: 8, fontWeight: '900', fontSize: 19 },

  hiddenCardContainer: { flex: 1, flexDirection: 'row', marginBottom: 25, borderRadius: 35, overflow: 'hidden', paddingHorizontal: 15 },
  hiddenBtn: { width: 90, justifyContent: 'center', alignItems: 'center', borderRadius: 35 },

  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 120 },
  
  subLabel: { fontSize: 18, fontWeight: '900', marginTop: 10, marginBottom: 15 },
  input: { padding: 24, borderRadius: 28, marginBottom: 25, fontSize: 18, borderWidth: 1, fontWeight: '600' },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  catBtn: { paddingVertical: 20, borderRadius: 24, borderWidth: 1, flex: 1, marginHorizontal: 6, alignItems: 'center' },
  publishBtn: { padding: 24, borderRadius: 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  publishBtnText: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 0.5 },

  bigAvatar: { width: 140, height: 140, borderRadius: 70, justifyContent: 'center', alignItems: 'center', elevation: 8 },
  bigAvatarText: { color: '#fff', fontSize: 60, fontWeight: '900' },
  profileName: { fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  themeToggleCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 28, borderRadius: 32, borderWidth: 1, marginBottom: 25 },
  colorSwatch: { width: 48, height: 48, borderRadius: 24, marginRight: 15, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingVertical: 28, borderRadius: 32, borderWidth: 1 },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 38, fontWeight: '900', marginBottom: 8 },
  statLabel: { fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },

  // NEW: BILLION DOLLAR FLOATING NAV BAR
  floatingNavContainer: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 25, left: 25, right: 25, elevation: 15 },
  floatingNav: { flexDirection: 'row', borderRadius: 40, paddingVertical: 15, justifyContent: 'space-around', alignItems: 'center', borderWidth: 1, overflow: 'hidden' },
  navTab: { alignItems: 'center', justifyContent: 'center', width: 80 },
  publishNavBtn: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 4 },

  expandedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  expandedTitle: { fontSize: 40, fontWeight: '900', marginBottom: 25, letterSpacing: -1.5, lineHeight: 46 },
  expandedDesc: { fontSize: 22, lineHeight: 36, fontWeight: '500' },
});