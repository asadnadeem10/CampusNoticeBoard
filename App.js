import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  '#000000', '#007AFF', '#5856D6', '#FF2D55', 
  '#34C759', '#FF9500', '#FF3B30', '#32ADE6' 
];

const AVATAR_EMOJIS = [
  'Aa', '🎓', '🚀', '💡', '🔥', '👑', '👻', '💻', '🎸', '🕹️', '🎨'
];

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets(); 

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
  
  const [isSilentPublish, setIsSilentPublish] = useState(false);
  const [targetAudience, setTargetAudience] = useState('All Students');
  
  const [userName, setUserName] = useState('');
  const [rollNo, setRollNo] = useState(''); 
  const [tempName, setTempName] = useState('');
  const [tempRollNo, setTempRollNo] = useState(''); 
  const [password, setPassword] = useState(''); 
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState(null); 
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [userColor, setUserColor] = useState(AVATAR_COLORS[1]);
  const [userEmoji, setUserEmoji] = useState(''); 

  const scrollY = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const skeletonAnim = useRef(new Animated.Value(0.3)).current; 
  const navAnimFeed = useRef(new Animated.Value(1)).current;
  const navAnimProfile = useRef(new Animated.Value(1)).current;
  const listRef = useRef(null); 

  const theme = isDarkMode ? {
    bg: '#000000', surface: '#1C1C1E', card: '#1C1C1E', text: '#FFFFFF', subText: '#EBEBF599', 
    border: '#38383A', primary: userColor, accent: '#5856D6', danger: '#FF3B30', warning: '#FF9500'
  } : {
    bg: '#F2F2F7', surface: '#FFFFFF', card: '#FFFFFF', text: '#000000', subText: '#3C3C4399', 
    border: '#E5E5EA', primary: userColor, accent: '#5856D6', danger: '#FF3B30', warning: '#FF9500'
  };

  useEffect(() => {
    loadLocalData();
    registerForPushNotificationsAsync();
    
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(skeletonAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
          Animated.timing(skeletonAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
        ])
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
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') finalStatus = (await Notifications.requestPermissionsAsync()).status;
        if (finalStatus !== 'granted') return;
        token = (await Notifications.getExpoPushTokenAsync({ projectId: "your-expo-project-id-here" })).data;
        if (token) await setDoc(doc(db, 'pushTokens', token), { token: token, createdAt: serverTimestamp() }, { merge: true });
      }
    }
  }

  const loadLocalData = async () => {
    const storedName = await AsyncStorage.getItem('@user_name');
    const storedRole = await AsyncStorage.getItem('@user_role');
    const storedRollNo = await AsyncStorage.getItem('@user_roll_no');
    const storedTheme = await AsyncStorage.getItem('@dark_mode');
    const storedSaves = await AsyncStorage.getItem('@saved_notices');
    const storedColor = await AsyncStorage.getItem('@user_color'); 
    const storedEmoji = await AsyncStorage.getItem('@user_emoji'); 
    
    if (storedName) {
      setUserName(storedName);
      setIsAdmin(storedRole === 'admin');
      if (storedRollNo) setRollNo(storedRollNo);
    } else {
      setShowAuthModal(true);
    }
    if (storedTheme !== null) setIsDarkMode(JSON.parse(storedTheme));
    if (storedSaves !== null) setSavedNotices(JSON.parse(storedSaves));
    if (storedColor !== null) setUserColor(storedColor);
    if (storedEmoji) setUserEmoji(storedEmoji);
  };

  const changeUserColor = async (color) => {
    Haptics.selectionAsync();
    setUserColor(color);
    await AsyncStorage.setItem('@user_color', color);
  };

  const changeUserEmoji = async (emoji) => {
    Haptics.selectionAsync();
    const finalEmoji = emoji === 'Aa' ? '' : emoji; 
    setUserEmoji(finalEmoji);
    await AsyncStorage.setItem('@user_emoji', finalEmoji);
  };

  const displayAvatar = userEmoji || (userName ? userName.charAt(0) : 'A');

  const handleFilterSelect = (filter) => {
    Haptics.selectionAsync();
    setActiveFilter(filter);
    try {
      if (listRef.current) {
        if (typeof listRef.current.scrollToOffset === 'function') {
          listRef.current.scrollToOffset({ offset: 0, animated: true });
        } else if (listRef.current._listView && typeof listRef.current._listView.scrollToOffset === 'function') {
          listRef.current._listView.scrollToOffset({ offset: 0, animated: true });
        }
      }
    } catch (error) { console.log('Scroll to top bypassed'); }
  };

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
    if (authMode === 'admin') {
      const enteredID = tempName.trim().toUpperCase();
      if (enteredID === '' || password.trim() === '') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return showToast('Please enter ID and PIN.', 'error');
      }

      let isValidAdmin = false;
      // CO-ADMIN AUTHENTICATION LOGIC
      if ((enteredID === 'ASAD' && password === '15072003') || 
          (enteredID === 'MUTARF' && password === '17092005')) {
        isValidAdmin = true;
      }

      if (isValidAdmin) {
        await AsyncStorage.setItem('@user_role', 'admin');
        await AsyncStorage.setItem('@user_name', enteredID);
        setIsAdmin(true);
        setUserName(enteredID);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`Admin Protocol Verified: ${enteredID}`);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return showToast('Invalid Admin Credentials', 'error');
      }
    } else {
      const enteredName = tempName.trim();
      const enteredRollNo = tempRollNo.trim().toUpperCase();

      if (enteredName === '' || enteredRollNo === '') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return showToast('Name and Roll No. are required.', 'error');
      }

      await AsyncStorage.setItem('@user_role', 'student');
      await AsyncStorage.setItem('@user_name', enteredName);
      await AsyncStorage.setItem('@user_roll_no', enteredRollNo);
      setIsAdmin(false);
      setUserName(enteredName);
      setRollNo(enteredRollNo);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Welcome, ${enteredName}`);
    }

    setShowAuthModal(false);
    setPassword(''); 
    setTempRollNo('');
  };

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    Animated.spring(toastAnim, { toValue: insets.top > 0 ? insets.top + 10 : 40, friction: 5, tension: 40, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(toastAnim, { toValue: -150, duration: 300, useNativeDriver: true }).start(() => setToast({ visible: false, message: '', type: 'success' }));
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

  const sendPushNotification = async (noticeTitle, noticeCategory) => {
    try {
      const tokensSnapshot = await getDocs(collection(db, 'pushTokens'));
      const messages = [];
      tokensSnapshot.forEach((doc) => {
        messages.push({ to: doc.data().token, sound: 'default', title: `📢 GCUF ${noticeCategory} Update`, body: noticeTitle });
      });
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(messages),
      });
    } catch (error) { console.log("Notification error:", error); }
  };

  const publishNotice = async () => {
    if (!isAdmin) return;
    if (title.trim() === '' || description.trim() === '') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return showToast('Fill all fields.', 'error');
    }
    try {
      await addDoc(collection(db, 'notices'), { 
        title, description, category, targetAudience, 
        author: userName, likedBy: [], isPinned: false, createdAt: serverTimestamp() 
      });
      
      if (!isSilentPublish) {
        sendPushNotification(title, category);
      }
      
      setTitle(''); setDescription(''); setIsSilentPublish(false); setTargetAudience('All Students'); setActiveTab('feed'); setActiveFilter('All');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(isSilentPublish ? 'Notice added silently.' : 'Notice published to all devices!');
    } catch (error) { 
      console.error("PUBLISH CRASH REASON: ", error);
      showToast(`Failed: ${error.message}`, 'error'); 
    }
  };

  const deleteNotice = async (id) => {
    if (!isAdmin) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await deleteDoc(doc(db, 'notices', id));
    showToast('Notice permanently deleted.', 'error');
  };

  const purgeAllNotices = async () => {
    Alert.alert(
      "DANGER: Purge Database",
      "This will permanently delete ALL broadcasts. This action cannot be undone. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "NUKE FEED", 
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setIsLoading(true);
            try {
              const querySnapshot = await getDocs(collection(db, 'notices'));
              querySnapshot.forEach(async (document) => {
                await deleteDoc(doc(db, 'notices', document.id));
              });
              showToast('Database wiped successfully.', 'error');
            } catch (error) {
              console.log(error);
            }
          }
        }
      ]
    );
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

  const headerBaseHeight = Platform.OS === 'ios' ? 140 : 120;
  const headerCompactHeight = Platform.OS === 'ios' ? 100 : 80;
  const headerHeight = scrollY.interpolate({ 
    inputRange: [0, 80], 
    outputRange: [headerBaseHeight + insets.top, headerCompactHeight + insets.top], 
    extrapolate: 'clamp' 
  });
  const headerOpacity = scrollY.interpolate({ inputRange: [0, 40], outputRange: [1, 0], extrapolate: 'clamp' });
  const compactTitleOpacity = scrollY.interpolate({ inputRange: [40, 80], outputRange: [0, 1], extrapolate: 'clamp' });

  const renderSkeleton = () => (
    <Animated.View style={[styles.rowPadding, { opacity: skeletonAnim }]}>
      <View style={[styles.frontCardInner, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
        <View style={styles.cardHeader}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <View style={[styles.avatar, {backgroundColor: theme.border}]} />
            <View>
              <View style={{width: 100, height: 16, backgroundColor: theme.border, borderRadius: 8, marginBottom: 8}} />
              <View style={{width: 60, height: 12, backgroundColor: theme.border, borderRadius: 6}} />
            </View>
          </View>
        </View>
        <View style={{width: '85%', height: 24, backgroundColor: theme.border, borderRadius: 8, marginBottom: 16}} />
        <View style={{width: '100%', height: 16, backgroundColor: theme.border, borderRadius: 8, marginBottom: 8}} />
        <View style={{width: '90%', height: 16, backgroundColor: theme.border, borderRadius: 8}} />
      </View>
    </Animated.View>
  );

  const renderNotice = (data) => {
    const item = data.item;
    let catColor = theme.primary; let catIcon = 'megaphone';
    if (item.category === 'Urgent') { catColor = theme.danger; catIcon = 'alert-circle'; }
    if (item.category === 'Event') { catColor = '#34C759'; catIcon = 'calendar'; }
    
    const likeCount = item.likedBy ? item.likedBy.length : 0;
    const hasLiked = item.likedBy && item.likedBy.includes(userName);
    const isSaved = savedNotices.includes(item.id);
    
    const isPostAdmin = item.author === 'ASAD' || item.author === 'MUTARF';
    const isMyPost = item.author === userName;
    
    const cardAvatarText = isMyPost ? displayAvatar : (item.author ? item.author.charAt(0) : 'A');
    
    const timeString = timeAgo(item.createdAt);
    const isNewPost = timeString === 'Just now' || timeString.includes('m ago');

    return (
      // ULTIMATE ANTI-BLEED ARCHITECTURE
      // paddingTop creates the gap physically on the outside wrapper.
      <View style={styles.rowPadding}>
        <View style={styles.frontShadowBox}>
          <View style={[styles.frontCardInner, { backgroundColor: theme.card, borderColor: item.isPinned ? theme.warning : theme.border, borderWidth: item.isPinned ? 1.5 : 0.5 }]}>
            
            <View style={[styles.colorAccentStrip, {backgroundColor: catColor}]} />

            <Pressable onPress={() => handleCardPress(item)} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); toggleBookmark(item.id); }}>
              <View style={styles.cardHeader}>
                <View style={styles.authorRow}>
                  <View style={[styles.avatar, {backgroundColor: isMyPost ? theme.primary : (isPostAdmin ? '#5856D6' : theme.border)}]}>
                    <Text style={{color: '#fff', fontWeight: '800', fontSize: isMyPost && userEmoji ? 22 : 18}}>{cardAvatarText}</Text>
                  </View>
                  <View>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Text style={[styles.cardAuthor, {color: theme.text}]}>{item.author}</Text>
                      {isPostAdmin && <MaterialCommunityIcons name="check-decagram" size={16} color="#007AFF" style={{marginLeft: 4}} />}
                    </View>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                      {item.isPinned && <Ionicons name="pin" size={12} color={theme.warning} style={{marginRight: 4}} />}
                      <Text style={{color: theme.subText, fontSize: 13, fontWeight: '500'}}>{timeString}</Text>
                      
                      {isNewPost && <Animated.View style={[styles.newDot, { opacity: pulseAnim }]} />}

                      <Text style={{color: theme.subText, fontSize: 13, fontWeight: '500', marginHorizontal: 6}}>•</Text>
                      <Text style={{color: theme.subText, fontSize: 13, fontWeight: '500'}}>{calculateReadTime(item.description)}</Text>
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
                  <Ionicons name="share-outline" size={24} color={theme.subText} />
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
        </View>
      </View>
    );
  };

  const renderHiddenItem = (data) => {
    return (
      // The hidden layer ALSO takes the exact same padding. It is impossible to bleed into the gap.
      <View style={[styles.rowPadding, { flex: 1 }]}>
        <View style={styles.hiddenRowInner}>
          <TouchableOpacity style={[styles.hiddenBtnLeft, {backgroundColor: '#007AFF'}]} onPress={() => { toggleBookmark(data.item.id); if(listRef.current) listRef.current.closeAllOpenRows(); }}>
             <Ionicons name="bookmark" size={28} color="#fff" />
          </TouchableOpacity>
          
          <View style={{flex: 1}} />

          {isAdmin && (
            <TouchableOpacity style={[styles.hiddenBtnRight, {backgroundColor: theme.danger}]} onPress={() => deleteNotice(data.item.id)}>
              <Ionicons name="trash" size={32} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.bg}]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      
      {toast.visible && (
        <Animated.View style={[styles.toast, { transform: [{ translateY: toastAnim }], backgroundColor: toast.type === 'error' ? theme.danger : theme.surface }]}>
          <Ionicons name={toast.type === 'error' ? "warning" : "checkmark-circle"} size={20} color={toast.type === 'error' ? "#fff" : theme.primary} />
          <Text style={[styles.toastText, {color: toast.type === 'error' ? '#fff' : theme.text}]}>{toast.message}</Text>
        </Animated.View>
      )}

      {/* AUTHENTICATION MODAL */}
      <Modal visible={showAuthModal} animationType="slide" transparent={false} presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.authContainer, {backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom}]}>
          <View style={[styles.iconBlur, {backgroundColor: theme.primary + '15'}]}>
             <Ionicons name="finger-print" size={80} color={theme.primary} />
          </View>
          <Text style={[styles.authTitle, {color: theme.text}]}>GCUF Connect</Text>
          <Text style={[styles.authSub, {color: theme.subText}]}>Secure Campus Network</Text>

          {!authMode ? (
            <View style={{width: '100%', marginTop: 50}}>
              <TouchableOpacity style={[styles.authRoleBtn, {backgroundColor: theme.surface, borderColor: theme.border}]} onPress={() => { Haptics.selectionAsync(); setAuthMode('student'); }}>
                <Ionicons name="school" size={26} color={theme.primary} />
                <Text style={[styles.authRoleText, {color: theme.text}]}>Student Login</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.subText} />
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.authRoleBtn, {backgroundColor: theme.surface, borderColor: theme.border, marginTop: 15}]} onPress={() => { Haptics.selectionAsync(); setAuthMode('admin'); }}>
                <Ionicons name="shield-checkmark" size={26} color={theme.accent} />
                <Text style={[styles.authRoleText, {color: theme.text}]}>Admin Login</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.subText} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{width: '100%', marginTop: 40}}>
              
              {authMode === 'admin' ? (
                <>
                  <TextInput style={[styles.authInput, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, marginBottom: 15}]} placeholder="Administrator ID" placeholderTextColor={theme.subText} value={tempName} onChangeText={setTempName} autoCapitalize="characters" />
                  <View style={[styles.passwordContainer, {backgroundColor: theme.surface, borderColor: theme.border}]}>
                    <Ionicons name="lock-closed" size={20} color={theme.subText} style={{marginLeft: 20}} />
                    <TextInput style={[styles.passwordInput, {color: theme.text}]} placeholder="Enter Security Pin" placeholderTextColor={theme.subText} value={password} onChangeText={setPassword} secureTextEntry={true} keyboardType="numeric" />
                  </View>
                </>
              ) : (
                <>
                  <TextInput style={[styles.authInput, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, marginBottom: 15}]} placeholder="Enter Full Name" placeholderTextColor={theme.subText} value={tempName} onChangeText={setTempName} autoCapitalize="words" />
                  <TextInput style={[styles.authInput, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, marginBottom: 20}]} placeholder="Enter Roll No. (e.g. BSCS-24)" placeholderTextColor={theme.subText} value={tempRollNo} onChangeText={setTempRollNo} autoCapitalize="characters" />
                </>
              )}

              <TouchableOpacity style={[styles.authSubmitBtn, {backgroundColor: authMode === 'admin' ? theme.accent : theme.primary}]} onPress={handleLogin}>
                <Text style={styles.authSubmitText}>Authenticate</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={{marginTop: 30, alignItems: 'center', padding: 10}} onPress={() => { Haptics.selectionAsync(); setAuthMode(null); setTempName(''); setTempRollNo(''); setPassword(''); }}>
                <Text style={{color: theme.subText, fontWeight: '600', fontSize: 16}}>Cancel & Go Back</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* READING MODAL */}
      <Modal visible={!!selectedNotice} animationType="fade" transparent={true}>
        <BlurView intensity={isDarkMode ? 50 : 80} tint={isDarkMode ? "dark" : "light"} style={styles.pageSheetOverlay}>
          <View style={[styles.pageSheetContent, {backgroundColor: theme.bg, paddingTop: insets.top > 0 ? 20 : 30, paddingBottom: insets.bottom + 40}]}>
            <View style={styles.dragIndicator} />
            
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, marginBottom: 20}}>
               <View style={[styles.badge, { backgroundColor: theme.primary+'20', paddingHorizontal: 16, paddingVertical: 8 }]}>
                <Text style={[styles.badgeText, {color: theme.primary, fontSize: 13}]}>{selectedNotice?.category}</Text>
               </View>
               <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setSelectedNotice(null); }}>
                 <View style={{backgroundColor: theme.border, padding: 8, borderRadius: 20}}>
                   <Ionicons name="close" size={24} color={theme.text} />
                 </View>
               </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{paddingHorizontal: 25}}>
              <Text style={[styles.expandedTitle, {color: theme.text}]}>{selectedNotice?.title}</Text>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 30, borderBottomWidth: 0.5, borderColor: theme.border, paddingBottom: 25}}>
                <View style={[styles.avatar, {backgroundColor: theme.surface, width: 52, height: 52, borderRadius: 26, borderWidth: 0.5, borderColor: theme.border}]}><Text style={{color: theme.text, fontWeight: '700', fontSize: 18}}>{selectedNotice?.author.charAt(0)}</Text></View>
                <View style={{marginLeft: 15}}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Text style={{color: theme.text, fontWeight: '700', fontSize: 17}}>{selectedNotice?.author}</Text>
                    {(selectedNotice?.author === 'ASAD' || selectedNotice?.author === 'MUTARF') && <MaterialCommunityIcons name="check-decagram" size={16} color="#007AFF" style={{marginLeft: 4}} />}
                  </View>
                  <Text style={{color: theme.subText, marginTop: 4, fontWeight: '500', fontSize: 14}}>{timeAgo(selectedNotice?.createdAt)} • {calculateReadTime(selectedNotice?.description)}</Text>
                </View>
              </View>
              <Text style={[styles.expandedDesc, {color: theme.text}]}>{selectedNotice?.description}</Text>
            </ScrollView>
          </View>
        </BlurView>
      </Modal>

      {/* HEADER */}
      {activeTab === 'feed' ? (
        <Animated.View style={[styles.header, { height: headerHeight, zIndex: 10, paddingTop: insets.top, overflow: 'hidden' }]}>
          <BlurView intensity={isDarkMode ? 80 : 100} tint={isDarkMode ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <Animated.View style={{ opacity: headerOpacity }}>
            <Text style={{color: theme.subText, fontSize: 15, fontWeight: '700', letterSpacing: 0.3}}>{getGreeting()},</Text>
            <Text style={[styles.headerTitle, {color: theme.text}]}>{userName ? userName.split(' ')[0] : 'Student'}</Text>
          </Animated.View>
          
          <Animated.View style={{position: 'absolute', bottom: 15, left: 20, opacity: compactTitleOpacity}}>
             <Text style={{color: theme.text, fontSize: 22, fontWeight: '800'}}>Campus Board</Text>
          </Animated.View>

          <TouchableOpacity onPress={() => switchTab(isAdmin ? 'dashboard' : 'profile')}>
            <View style={[styles.headerAvatar, {backgroundColor: theme.primary}]}>
              <Text style={{color: '#fff', fontWeight: '800', fontSize: userEmoji ? 26 : 18}}>{displayAvatar}</Text>
              {isAdmin && <View style={styles.adminDot} />}
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={[styles.staticHeader, {backgroundColor: theme.bg, paddingTop: insets.top + 20}]}>
          <Text style={{color: theme.text, fontSize: 32, fontWeight: '800', letterSpacing: -1}}>
            {activeTab === 'publish' ? 'New Broadcast' : activeTab === 'dashboard' ? 'Admin Console' : 'Your Profile'}
          </Text>
        </View>
      )}

      {/* FEED TAB */}
      {activeTab === 'feed' && (
        <View style={styles.screenContainer}>
          {isLoading ? (
            <View style={{paddingHorizontal: 20, paddingTop: 10}}>
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
              leftOpenValue={80} 
              disableRightSwipe={false}
              initialNumToRender={5}
              maxToRenderPerBatch={5}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 140 + insets.bottom, paddingTop: 10}} 
              
              onScroll={Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {useNativeDriver: false})}
              scrollEventThrottle={16}
              
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRefreshing(true); setTimeout(() => setRefreshing(false), 1000);}} tintColor={theme.primary} />}
              
              ListHeaderComponent={
                <View>
                  <View style={[styles.searchContainer, {backgroundColor: theme.surface, borderColor: theme.border}]}>
                    <Ionicons name="search" size={20} color={theme.subText} style={{marginRight: 10}} />
                    <TextInput style={[styles.searchInput, {color: theme.text}]} placeholder="Search updates..." placeholderTextColor={theme.subText} value={searchQuery} onChangeText={setSearchQuery} />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {['All', 'General', 'Urgent', 'Event', 'Saved'].map(filter => (
                      <TouchableOpacity key={filter} style={[styles.filterChip, {backgroundColor: theme.surface, borderColor: theme.border}, activeFilter === filter && {backgroundColor: theme.text, borderColor: theme.text}]} onPress={() => handleFilterSelect(filter)}>
                        <Text style={[styles.filterChipText, {color: theme.text}, activeFilter === filter && {color: theme.bg}]}>{filter}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              }

              ListEmptyComponent={
                !isLoading && (
                  <Animated.View style={styles.emptyState}>
                    <Ionicons name="folder-open-outline" size={70} color={theme.border} />
                    <Text style={{color: theme.subText, fontSize: 18, marginTop: 15, fontWeight: '600'}}>No broadcasts found.</Text>
                  </Animated.View>
                )
              }
            />
          )}
        </View>
      )}

      {/* PUBLISH TAB */}
      {activeTab === 'publish' && isAdmin && (
        <ScrollView style={styles.screenContainer} contentContainerStyle={{padding: 20, paddingBottom: 140 + insets.bottom}}>
          <Text style={{color: theme.subText, marginBottom: 30, fontSize: 15, lineHeight: 22, fontWeight: '500'}}>Notifications will be securely pushed to all campus devices on the GCUF network.</Text>
          <TextInput style={[styles.input, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border}]} placeholder="Enter Headline..." placeholderTextColor={theme.subText} value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, {height: 200, textAlignVertical: 'top', backgroundColor: theme.surface, color: theme.text, borderColor: theme.border}]} placeholder="Write complete details here..." placeholderTextColor={theme.subText} multiline value={description} onChangeText={setDescription} />
          
          <Text style={[styles.subLabel, {color: theme.text}]}>Target Audience</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 25}}>
            {['All Students', 'CS Department', 'Faculty Only'].map(audience => (
              <TouchableOpacity key={audience} style={[styles.filterChip, {backgroundColor: theme.surface, borderColor: theme.border, height: 40}, targetAudience === audience && {backgroundColor: theme.primary, borderColor: theme.primary}]} onPress={() => {Haptics.selectionAsync(); setTargetAudience(audience);}}>
                <Text style={[{color: theme.subText, fontWeight: '700'}, targetAudience === audience && {color: '#fff'}]}>{audience}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.subLabel, {color: theme.text}]}>Priority Level</Text>
          <View style={styles.categoryRow}>
            {['General', 'Event', 'Urgent'].map((cat) => {
               const isActive = category === cat;
               let activeColor = theme.primary;
               if(cat === 'Urgent') activeColor = theme.danger;
               if(cat === 'Event') activeColor = '#34C759';

               return (
                 <TouchableOpacity key={cat} style={[styles.catBtn, {backgroundColor: theme.surface, borderColor: theme.border}, isActive && {backgroundColor: activeColor+'15', borderColor: activeColor}]} onPress={() => { Haptics.selectionAsync(); setCategory(cat); }}>
                   <Text style={[{color: theme.subText, fontWeight: '700'}, isActive && {color: activeColor}]}>{cat}</Text>
                 </TouchableOpacity>
               )
            })}
          </View>
          
          <View style={[styles.themeToggleCard, {backgroundColor: theme.surface, borderColor: theme.border}]}>
            <View style={{flex: 1}}>
              <Text style={{color: theme.danger, fontWeight: '700', fontSize: 16}}>Stealth Publish</Text>
              <Text style={{color: theme.subText, fontSize: 13, marginTop: 4}}>Post without pushing device notifications.</Text>
            </View>
            <Switch value={isSilentPublish} onValueChange={() => { Haptics.selectionAsync(); setIsSilentPublish(!isSilentPublish);}} trackColor={{ false: theme.border, true: theme.danger }} thumbColor={"#fff"} />
          </View>

          <TouchableOpacity style={[styles.publishBtn, {backgroundColor: theme.accent}]} onPress={publishNotice}>
            <Ionicons name={isSilentPublish ? "eye-off" : "paper-plane"} size={22} color="#fff" style={{marginRight: 10}} />
            <Text style={styles.publishBtnText}>{isSilentPublish ? 'Publish Silently' : 'Dispatch Notice'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* DASHBOARD TAB (ADMIN ONLY) */}
      {activeTab === 'dashboard' && isAdmin && (
        <ScrollView style={styles.screenContainer} contentContainerStyle={{padding: 20, paddingBottom: 140 + insets.bottom}}>
          
          {/* ADMIN ID CARD & CUSTOMIZATION */}
          <View style={[styles.idCard, {backgroundColor: theme.surface, borderColor: theme.border}]}>
            <View style={[styles.bigAvatar, {backgroundColor: theme.primary}]}>
              <Text style={[styles.bigAvatarText, userEmoji && {fontSize: 60}]}>{displayAvatar}</Text>
            </View>
            <View style={{alignItems: 'center', marginTop: 15}}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text style={[styles.profileName, {color: theme.text}]}>{userName}</Text>
                <MaterialCommunityIcons name="check-decagram" size={24} color="#007AFF" style={{marginLeft: 8}} />
              </View>
              <Text style={{color: '#5856D6', fontSize: 13, fontWeight: '700', marginTop: 6, letterSpacing: 1.5, textTransform: 'uppercase'}}>System Administrator</Text>
            </View>
          </View>

          <View style={[styles.themeToggleCard, {backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'column', alignItems: 'flex-start'}]}>
            <Text style={{color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 15}}>Identity & Emoji</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 15}}>
              {AVATAR_EMOJIS.map((emoji) => {
                const isActive = (emoji === 'Aa' && !userEmoji) || emoji === userEmoji;
                return (
                  <TouchableOpacity key={emoji} onPress={() => changeUserEmoji(emoji)} style={[styles.emojiSwatch, {backgroundColor: isActive ? theme.border : 'transparent'}]}>
                    <Text style={{fontSize: 26, fontWeight: '800', color: theme.text}}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 5}}>
              {AVATAR_COLORS.map((color) => (
                <TouchableOpacity key={color} onPress={() => changeUserColor(color)} style={[styles.colorSwatch, {backgroundColor: color, borderColor: theme.border, borderWidth: userColor === color ? 3 : 1}]}>
                  {userColor === color && <Ionicons name="checkmark" size={18} color={color === '#FFFFFF' ? '#000' : '#fff'} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ADMIN ANALYTICS */}
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 25, marginTop: 10}}>
             <MaterialCommunityIcons name="shield-account" size={32} color={theme.primary} />
             <Text style={{color: theme.text, fontSize: 24, fontWeight: '800', marginLeft: 10}}>System Overview</Text>
          </View>

          <View style={styles.categoryRow}>
            <View style={[styles.dashboardCard, {backgroundColor: theme.surface, borderColor: theme.border}]}>
              <Ionicons name="documents" size={28} color={theme.accent} />
              <Text style={[styles.dashboardNum, {color: theme.text}]}>{notices.length}</Text>
              <Text style={styles.dashboardLabel}>Active Broadcasts</Text>
            </View>
            <View style={[styles.dashboardCard, {backgroundColor: theme.surface, borderColor: theme.border}]}>
              <Ionicons name="flash" size={28} color={theme.warning} />
              <Text style={[styles.dashboardNum, {color: theme.text}]}>{notices.filter(n => n.category === 'Urgent').length}</Text>
              <Text style={styles.dashboardLabel}>Urgent Alerts</Text>
            </View>
          </View>

          <View style={[styles.themeToggleCard, {backgroundColor: theme.surface, borderColor: theme.border, marginTop: 10}]}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Ionicons name={isDarkMode ? "moon" : "sunny"} size={26} color={isDarkMode ? theme.accent : theme.warning} />
              <Text style={{color: theme.text, fontWeight: '700', fontSize: 17, marginLeft: 15}}>Dark Appearance</Text>
            </View>
            <Switch value={isDarkMode} onValueChange={() => { Haptics.selectionAsync(); setIsDarkMode(!isDarkMode); AsyncStorage.setItem('@dark_mode', JSON.stringify(!isDarkMode));}} trackColor={{ false: theme.border, true: theme.primary }} thumbColor={"#fff"} />
          </View>

          <TouchableOpacity style={[styles.themeToggleCard, {backgroundColor: theme.danger + '10', borderColor: theme.danger + '50', marginTop: 10}]} onPress={purgeAllNotices}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Ionicons name="skull" size={26} color={theme.danger} />
              <View style={{marginLeft: 15}}>
                <Text style={{color: theme.danger, fontWeight: '800', fontSize: 17}}>Purge Database</Text>
                <Text style={{color: theme.danger, opacity: 0.8, fontSize: 13, marginTop: 2}}>Permanently delete all network notices.</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={{marginTop: 30, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, paddingVertical: 18, paddingHorizontal: 35, borderRadius: 20, borderWidth: 0.5, borderColor: theme.border, alignSelf: 'center'}} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); AsyncStorage.clear(); setUserName(''); setShowAuthModal(true); setPassword(''); setTempName(''); setTempRollNo(''); setRollNo(''); setIsAdmin(false); }}>
            <Ionicons name="log-out-outline" size={22} color={theme.danger} />
            <Text style={{color: theme.danger, fontSize: 16, fontWeight: '700', marginLeft: 10}}>Sign Out Root Access</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* STUDENT PROFILE TAB */}
      {activeTab === 'profile' && !isAdmin && (
        <ScrollView style={styles.screenContainer} contentContainerStyle={{padding: 20, alignItems: 'center', paddingBottom: 140 + insets.bottom}}>
          
          <View style={[styles.idCard, {backgroundColor: theme.surface, borderColor: theme.border}]}>
            <View style={[styles.bigAvatar, {backgroundColor: theme.primary}]}>
              <Text style={[styles.bigAvatarText, userEmoji && {fontSize: 60}]}>{displayAvatar}</Text>
            </View>
            <View style={{alignItems: 'center', marginTop: 15}}>
              <Text style={[styles.profileName, {color: theme.text}]}>{userName}</Text>
              {rollNo ? <Text style={{color: theme.subText, fontSize: 16, fontWeight: '600', marginTop: 4, letterSpacing: 1}}>{rollNo}</Text> : null}
              <Text style={{color: theme.subText, fontSize: 13, fontWeight: '700', marginTop: 8, letterSpacing: 1.5, textTransform: 'uppercase'}}>Verified Student</Text>
            </View>
          </View>

          <View style={[styles.themeToggleCard, {backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'column', alignItems: 'flex-start'}]}>
            <Text style={{color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 15}}>Identity & Emoji</Text>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 15}}>
              {AVATAR_EMOJIS.map((emoji) => {
                const isActive = (emoji === 'Aa' && !userEmoji) || emoji === userEmoji;
                return (
                  <TouchableOpacity key={emoji} onPress={() => changeUserEmoji(emoji)} style={[styles.emojiSwatch, {backgroundColor: isActive ? theme.border : 'transparent'}]}>
                    <Text style={{fontSize: 26, fontWeight: '800', color: theme.text}}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 5}}>
              {AVATAR_COLORS.map((color) => (
                <TouchableOpacity key={color} onPress={() => changeUserColor(color)} style={[styles.colorSwatch, {backgroundColor: color, borderColor: theme.border, borderWidth: userColor === color ? 3 : 1}]}>
                  {userColor === color && <Ionicons name="checkmark" size={18} color={color === '#FFFFFF' ? '#000' : '#fff'} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.themeToggleCard, {backgroundColor: theme.surface, borderColor: theme.border}]}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Ionicons name={isDarkMode ? "moon" : "sunny"} size={26} color={isDarkMode ? theme.accent : theme.warning} />
              <Text style={{color: theme.text, fontWeight: '700', fontSize: 17, marginLeft: 15}}>Dark Appearance</Text>
            </View>
            <Switch value={isDarkMode} onValueChange={() => { Haptics.selectionAsync(); setIsDarkMode(!isDarkMode); AsyncStorage.setItem('@dark_mode', JSON.stringify(!isDarkMode));}} trackColor={{ false: theme.border, true: theme.primary }} thumbColor={"#fff"} />
          </View>
          
          <View style={[styles.statsRow, {backgroundColor: theme.surface, borderColor: theme.border}]}>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, {color: theme.text}]}>{savedNotices.length}</Text>
              <Text style={[styles.statLabel, {color: theme.subText}]}>Bookmarks</Text>
            </View>
            <View style={[styles.statBox, {borderLeftWidth: 0.5, borderColor: theme.border}]}>
              <Text style={[styles.statNumber, {color: theme.text}]}>{notices.filter(n => n.likedBy.includes(userName)).length}</Text>
              <Text style={[styles.statLabel, {color: theme.subText}]}>Interactions</Text>
            </View>
          </View>

          <TouchableOpacity style={{marginTop: 40, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, paddingVertical: 18, paddingHorizontal: 35, borderRadius: 20, borderWidth: 0.5, borderColor: theme.border}} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); AsyncStorage.clear(); setUserName(''); setShowAuthModal(true); setPassword(''); setTempName(''); setTempRollNo(''); setRollNo(''); }}>
            <Ionicons name="log-out-outline" size={22} color={theme.danger} />
            <Text style={{color: theme.danger, fontSize: 16, fontWeight: '700', marginLeft: 10}}>Sign Out Session</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* BILLION DOLLAR FLOATING PILL NAV */}
      <View style={[styles.floatingNavContainer, { bottom: insets.bottom > 0 ? insets.bottom + 10 : 25, shadowColor: isDarkMode ? '#000' : '#888' }]}>
        <BlurView intensity={isDarkMode ? 60 : 90} tint={isDarkMode ? "dark" : "light"} style={[styles.floatingNav, {backgroundColor: isDarkMode ? 'rgba(28,28,30,0.75)' : 'rgba(255,255,255,0.75)', borderColor: theme.border}]}>
          <TouchableOpacity style={styles.navTab} onPress={() => switchTab('feed')}>
            <Animated.View style={{ transform: [{ scale: navAnimFeed }] }}>
              {notices.length > 0 && activeTab !== 'feed' && (
                <View style={{position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: theme.danger, borderWidth: 2, borderColor: theme.surface, zIndex: 10}} />
              )}
              <Ionicons name={activeTab === 'feed' ? "home" : "home-outline"} size={26} color={activeTab === 'feed' ? theme.primary : theme.subText} />
            </Animated.View>
          </TouchableOpacity>
          
          {isAdmin && (
            <TouchableOpacity style={styles.navTab} onPress={() => switchTab('publish')}>
              <View style={[styles.publishNavBtn, {backgroundColor: theme.accent}]}>
                <Ionicons name="add" size={28} color="#fff" />
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.navTab} onPress={() => switchTab(isAdmin ? 'dashboard' : 'profile')}>
            <Animated.View style={{ transform: [{ scale: navAnimProfile }] }}>
              {isAdmin ? (
                <MaterialCommunityIcons name={activeTab === 'dashboard' ? "shield-account" : "shield-account-outline"} size={28} color={activeTab === 'dashboard' ? theme.primary : theme.subText} />
              ) : (
                <Ionicons name={activeTab === 'profile' ? "person" : "person-outline"} size={26} color={activeTab === 'profile' ? theme.primary : theme.subText} />
              )}
            </Animated.View>
          </TouchableOpacity>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 25 },
  iconBlur: { padding: 25, borderRadius: 35, marginBottom: 25 },
  authTitle: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  authSub: { fontSize: 17, marginTop: 8, fontWeight: '500' },
  authRoleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 22, borderRadius: 24, borderWidth: 0.5, width: '100%' },
  authRoleText: { fontSize: 19, fontWeight: '700', flex: 1, marginLeft: 15 },
  authInput: { padding: 22, borderRadius: 24, fontSize: 17, borderWidth: 0.5, width: '100%', fontWeight: '600' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderRadius: 24, width: '100%', marginBottom: 30 },
  passwordInput: { flex: 1, padding: 22, fontSize: 17, fontWeight: '600' },
  authSubmitBtn: { padding: 22, borderRadius: 24, alignItems: 'center', width: '100%', shadowOffset: {width:0,height:8}, shadowOpacity: 0.2, shadowRadius: 12 },
  authSubmitText: { color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: 0.5 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingBottom: 20 },
  staticHeader: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 0.5, borderColor: '#38383A' },
  headerTitle: { fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 4 },
  headerAvatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', position: 'absolute', right: 20, bottom: 15, shadowOffset: {width:0,height:4}, shadowOpacity: 0.2, shadowRadius: 6 },
  adminDot: { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: '#34C759', borderWidth: 2, borderColor: '#000' },
  
  screenContainer: { flex: 1 },
  toast: { position: 'absolute', alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, flexDirection: 'row', alignItems: 'center', zIndex: 1000, shadowColor: '#000', shadowOffset: {width:0, height:6}, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8 },
  toastText: { fontWeight: '700', fontSize: 15, marginLeft: 10 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 5, marginBottom: 15, paddingHorizontal: 15, borderRadius: 20, borderWidth: 0.5 },
  searchInput: { flex: 1, paddingVertical: 16, fontSize: 16, fontWeight: '500' },
  chipScroll: { maxHeight: 50, marginBottom: 20 },
  filterChip: { paddingHorizontal: 24, justifyContent: 'center', borderRadius: 20, marginRight: 10, borderWidth: 0.5, height: 44 },
  filterChipText: { fontWeight: '700', fontSize: 14 },

  // ULTIMATE ANTI-BLEED ARCHITECTURE
  // The gap is created by transparent padding on the top of each list row, eliminating background color bleeding entirely.
  rowPadding: { paddingTop: 20, backgroundColor: 'transparent' },
  frontShadowBox: { shadowColor: '#000', shadowOffset: {width:0,height:4}, shadowOpacity: 0.08, shadowRadius: 15, elevation: 1, backgroundColor: 'transparent', borderRadius: 24 },
  frontCardInner: { padding: 22, borderRadius: 24, overflow: 'hidden' },
  
  colorAccentStrip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF', marginLeft: 6 },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15, paddingLeft: 4 },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardAuthor: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.2 },
  cardTitle: { fontSize: 22, fontWeight: '700', marginBottom: 10, letterSpacing: -0.5, lineHeight: 28, paddingLeft: 4 },
  cardDesc: { fontSize: 16, lineHeight: 24, marginBottom: 20, fontWeight: '400', paddingLeft: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.5, paddingTop: 15, paddingLeft: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingRight: 20 },
  actionText: { marginLeft: 6, fontWeight: '600', fontSize: 16 },

  // The hidden layer is trapped perfectly inside the 24px corner curve, forced to match the inner card size.
  hiddenRowInner: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', borderRadius: 24, overflow: 'hidden' },
  hiddenBtnLeft: { width: 80, justifyContent: 'center', alignItems: 'center' },
  hiddenBtnRight: { width: 90, justifyContent: 'center', alignItems: 'center' },

  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100, opacity: 0.6 },
  
  subLabel: { fontSize: 16, fontWeight: '700', marginTop: 10, marginBottom: 12 },
  input: { padding: 20, borderRadius: 24, marginBottom: 20, fontSize: 17, borderWidth: 0.5, fontWeight: '500' },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 35 },
  catBtn: { paddingVertical: 16, borderRadius: 20, borderWidth: 0.5, flex: 1, marginHorizontal: 5, alignItems: 'center' },
  publishBtn: { padding: 20, borderRadius: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', shadowOffset: {width:0, height:8}, shadowOpacity: 0.2, shadowRadius: 12 },
  publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 18, letterSpacing: 0.3 },

  dashboardCard: { flex: 1, padding: 20, borderRadius: 20, borderWidth: 0.5, marginHorizontal: 5, alignItems: 'center' },
  dashboardNum: { fontSize: 32, fontWeight: '800', marginTop: 10, marginBottom: 4 },
  dashboardLabel: { color: '#8E8E93', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },

  idCard: { width: '100%', padding: 30, borderRadius: 28, borderWidth: 0.5, alignItems: 'center', marginBottom: 30, shadowOffset: {width:0,height:10}, shadowOpacity: 0.05, shadowRadius: 20 },
  bigAvatar: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', shadowOffset: {width:0,height:8}, shadowOpacity: 0.2, shadowRadius: 12 },
  bigAvatarText: { color: '#fff', fontSize: 40, fontWeight: '800' },
  profileName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },

  themeToggleCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 24, borderRadius: 24, borderWidth: 0.5, marginBottom: 20 },
  
  emojiSwatch: { width: 54, height: 54, borderRadius: 27, marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  colorSwatch: { width: 44, height: 44, borderRadius: 22, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingVertical: 24, borderRadius: 24, borderWidth: 0.5 },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 32, fontWeight: '700', marginBottom: 6 },
  statLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },

  floatingNavContainer: { position: 'absolute', left: 20, right: 20, shadowOffset: {width:0, height:10}, shadowOpacity: 0.15, shadowRadius: 20 },
  floatingNav: { flexDirection: 'row', borderRadius: 35, paddingVertical: 12, justifyContent: 'space-around', alignItems: 'center', borderWidth: 0.5, overflow: 'hidden' },
  navTab: { alignItems: 'center', justifyContent: 'center', width: 70 },
  publishNavBtn: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', shadowOffset: {width:0,height:5}, shadowOpacity: 0.2, shadowRadius: 8 },

  pageSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pageSheetContent: { height: '90%', borderTopLeftRadius: 35, borderTopRightRadius: 35, shadowColor: '#000', shadowOffset: {width: 0, height: -10}, shadowOpacity: 0.1, shadowRadius: 20 },
  dragIndicator: { width: 45, height: 5, backgroundColor: '#8E8E93', borderRadius: 3, alignSelf: 'center', marginBottom: 25 },
  expandedTitle: { fontSize: 34, fontWeight: '800', marginBottom: 20, letterSpacing: -1, lineHeight: 40 },
  expandedDesc: { fontSize: 19, lineHeight: 32, fontWeight: '400' },
});