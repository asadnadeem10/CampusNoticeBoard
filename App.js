import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform, RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput, TouchableOpacity,
  UIManager,
  View
} from 'react-native';
import { SwipeListView } from 'react-native-swipe-list-view';
import { db } from './firebaseConfig';

// NEW: Notification Imports
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

// Tell the phone to show alerts even if the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function App() {
  const [activeTab, setActiveTab] = useState('feed'); 
  const [notices, setNotices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All'); 
  const [sortBy, setSortBy] = useState('newest'); 
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
  const [showNameModal, setShowNameModal] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false); 

  const theme = isDarkMode ? {
    bg: '#0a0a0a', card: '#161616', text: '#ffffff', subText: '#888888', border: '#2a2a2a', input: '#1a1a1a', nav: '#111111'
  } : {
    bg: '#f3f4f6', card: '#ffffff', text: '#111827', subText: '#6b7280', border: '#e5e7eb', input: '#f9fafb', nav: '#ffffff'
  };

  useEffect(() => {
    loadLocalData();
    registerForPushNotificationsAsync(); // NEW: Ask for notification permission on load

    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const noticesData = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(), likedBy: doc.data().likedBy || [], isPinned: doc.data().isPinned || false
      }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNotices(noticesData);
    });
    return () => unsubscribe();
  }, []);

  // NEW: Register Device for Push Notifications
  async function registerForPushNotificationsAsync() {
    let token;
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: "your-expo-project-id-here", // Works without this in Expo Go, needed for EAS Build later
      })).data;

      // Save this device's token to Firebase so we know who to message!
      if (token) {
        await setDoc(doc(db, 'pushTokens', token), { token: token, createdAt: serverTimestamp() }, { merge: true });
      }
    }
  }

  // NEW: Blast Notification to all devices
  const sendPushNotification = async (noticeTitle, noticeCategory) => {
    try {
      const tokensSnapshot = await getDocs(collection(db, 'pushTokens'));
      const messages = [];

      tokensSnapshot.forEach((doc) => {
        messages.push({
          to: doc.data().token,
          sound: 'default',
          title: `New GCUF ${noticeCategory} Notice! 📢`,
          body: noticeTitle,
          data: { someData: 'goes here' },
        });
      });

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Accept-encoding': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
    } catch (error) { console.log('Error sending push', error); }
  };

  const loadLocalData = async () => {
    try {
      const storedName = await AsyncStorage.getItem('@user_name');
      const storedTheme = await AsyncStorage.getItem('@dark_mode');
      const storedSaves = await AsyncStorage.getItem('@saved_notices');
      
      if (storedName) setUserName(storedName);
      else setShowNameModal(true);
      if (storedTheme !== null) setIsDarkMode(JSON.parse(storedTheme));
      if (storedSaves !== null) setSavedNotices(JSON.parse(storedSaves));
    } catch (e) { console.log(e); }
  };

  const saveUserName = async () => {
    if (tempName.trim() === '') return showToast('Please enter a name.', 'error');
    await AsyncStorage.setItem('@user_name', tempName.trim());
    setUserName(tempName.trim());
    setShowNameModal(false);
    setIsEditingProfile(false);
    showToast(`Welcome back, ${tempName.trim()}!`);
  };

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    Animated.spring(toastAnim, { toValue: Platform.OS === 'ios' ? 50 : 20, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(toastAnim, { toValue: -100, duration: 300, useNativeDriver: true }).start(() => {
        setToast({ visible: false, message: '', type: 'success' });
      });
    }, 3000);
  };

  const isVerifiedAdmin = (name) => {
    const safeName = name ? name.toUpperCase().trim() : '';
    return safeName === 'ASAD' || safeName === 'MUTARF';
  };

  const toggleTheme = async () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    await AsyncStorage.setItem('@dark_mode', JSON.stringify(newTheme));
  };

  const toggleBookmark = async (id) => {
    let newSaves;
    if (savedNotices.includes(id)) {
      newSaves = savedNotices.filter(saveId => saveId !== id);
      showToast('Removed from Bookmarks', 'error');
    } else {
      newSaves = [...savedNotices, id];
      showToast('Saved to Bookmarks');
    }
    setSavedNotices(newSaves);
    await AsyncStorage.setItem('@saved_notices', JSON.stringify(newSaves));
  };

  const togglePin = async (item) => {
    if (!isVerifiedAdmin(userName)) return;
    try {
      await updateDoc(doc(db, 'notices', item.id), { isPinned: !item.isPinned });
      showToast(item.isPinned ? 'Notice Unpinned' : 'Notice Pinned to Top!');
    } catch (error) { showToast('Error pinning notice', 'error'); }
  };

  const publishNotice = async () => {
    if (title.trim() === '' || description.trim() === '') return showToast('Fill all fields.', 'error');
    try {
      await addDoc(collection(db, 'notices'), {
        title, description, category, author: userName, likedBy: [], isPinned: false, createdAt: serverTimestamp(),
      });
      
      // NEW: Trigger the push notification blast!
      sendPushNotification(title, category);

      setTitle(''); setDescription(''); setActiveTab('feed'); setActiveFilter('All');
      showToast('Notice published successfully!');
    } catch (error) { showToast('Could not publish.', 'error'); }
  };

  const deleteNotice = async (id) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await deleteDoc(doc(db, 'notices', id));
      showToast('Notice deleted.', 'error');
    } catch (error) {}
  };

  const likeNotice = async (item) => {
    const noticeRef = doc(db, 'notices', item.id);
    const hasLiked = item.likedBy.includes(userName);
    try { await updateDoc(noticeRef, { likedBy: hasLiked ? arrayRemove(userName) : arrayUnion(userName) }); } 
    catch (error) {}
  };

  const shareNotice = async (title, desc) => {
    try { await Share.share({ message: `*GCUF Notice Board*\n\n📌 ${title}\n\n${desc}\n\nShared via Campus App` }); } 
    catch (error) {}
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const timeAgo = (timestamp) => {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((new Date() - timestamp.toDate()) / 1000);
    if (seconds / 86400 > 1) return Math.floor(seconds / 86400) + 'd ago';
    if (seconds / 3600 > 1) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds / 60 > 1) return Math.floor(seconds / 60) + 'm ago';
    return 'Just now';
  };

  let processedNotices = notices.filter(notice => {
    const matchesSearch = notice.title.toLowerCase().includes(searchQuery.toLowerCase()) || notice.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'All' || notice.category === activeFilter;
    const matchesBookmarks = activeFilter === 'Saved' ? savedNotices.includes(notice.id) : true;
    return matchesSearch && matchesFilter && matchesBookmarks;
  });

  if (sortBy === 'oldest') processedNotices.reverse();
  if (sortBy === 'popular') processedNotices.sort((a, b) => (b.likedBy?.length || 0) - (a.likedBy?.length || 0));
  
  processedNotices.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  const renderNotice = (data) => {
    const item = data.item;
    let catColor = '#3b82f6'; let catIcon = 'megaphone';
    if (item.category === 'Urgent') { catColor = '#ef4444'; catIcon = 'alert-circle'; }
    if (item.category === 'Event') { catColor = '#10b981'; catIcon = 'calendar'; }
    
    const likeCount = item.likedBy ? item.likedBy.length : 0;
    const hasLiked = item.likedBy && item.likedBy.includes(userName);
    const isSaved = savedNotices.includes(item.id);
    const isTrending = likeCount >= 3; 
    const isUserAdmin = isVerifiedAdmin(item.author);

    return (
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: item.isPinned ? '#eab308' : theme.border, borderWidth: item.isPinned ? 2 : 1 }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedNotice(item)}>
          <View style={styles.cardHeader}>
            <View style={styles.authorRow}>
              <View style={[styles.avatar, {backgroundColor: isUserAdmin ? '#0ea5e9' : theme.border}]}>
                <Text style={{color: '#fff', fontWeight: 'bold'}}>{item.author ? item.author.charAt(0).toUpperCase() : 'A'}</Text>
              </View>
              <View>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Text style={[styles.cardAuthor, {color: theme.text}]}>{item.author || 'Anonymous'}</Text>
                  {isUserAdmin && <Ionicons name="checkmark-circle" size={15} color="#0ea5e9" style={{marginLeft: 4}} />}
                </View>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  {item.isPinned && <Ionicons name="pin" size={12} color="#eab308" style={{marginRight: 4}} />}
                  <Text style={styles.timeText}>{timeAgo(item.createdAt)}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: catColor }]}>
              <Ionicons name={catIcon} size={12} color="#fff" style={{marginRight: 4}} />
              <Text style={styles.badgeText}>{item.category}</Text>
            </View>
          </View>

          <Text style={[styles.cardTitle, {color: theme.text}]}>{item.title}</Text>
          <Text style={[styles.cardDesc, {color: theme.subText}]} numberOfLines={2}>{item.description}</Text>
          
          {isTrending && (
            <View style={styles.trendingBadge}>
              <Ionicons name="flame" size={14} color="#f59e0b" />
              <Text style={styles.trendingText}>Trending</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={[styles.cardFooter, {borderColor: theme.border}]}>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => likeNotice(item)}>
              <Ionicons name={hasLiked ? "heart" : "heart-outline"} size={22} color={hasLiked ? "#ef4444" : theme.subText} />
              <Text style={[styles.actionText, hasLiked ? {color: '#ef4444'} : {color: theme.subText}]}>{likeCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => shareNotice(item.title, item.description)}>
              <Ionicons name="share-social-outline" size={20} color={theme.subText} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.actionRow}>
            {isVerifiedAdmin(userName) && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => togglePin(item)}>
                <Ionicons name={item.isPinned ? "pin" : "pin-outline"} size={22} color={item.isPinned ? "#eab308" : theme.subText} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionBtn} onPress={() => toggleBookmark(item.id)}>
              <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={22} color={isSaved ? "#0ea5e9" : theme.subText} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderHiddenItem = (data) => {
    const isMyPost = data.item.author === userName || isVerifiedAdmin(userName);
    const isSaved = savedNotices.includes(data.item.id);

    return (
      <View style={styles.hiddenCardContainer}>
        <TouchableOpacity style={[styles.hiddenBtn, styles.hiddenLeft]} onPress={() => toggleBookmark(data.item.id)}>
          <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={24} color="#fff" />
          <Text style={styles.hiddenText}>{isSaved ? 'Unsave' : 'Save'}</Text>
        </TouchableOpacity>

        {isMyPost ? (
          <TouchableOpacity style={[styles.hiddenBtn, styles.hiddenRight]} onPress={() => deleteNotice(data.item.id)}>
            <Ionicons name="trash-outline" size={24} color="#fff" />
            <Text style={styles.hiddenText}>Delete</Text>
          </TouchableOpacity>
        ) : <View style={styles.hiddenRight} />}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.container, {backgroundColor: theme.bg}]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      
      {toast.visible && (
        <Animated.View style={[styles.toast, { transform: [{ translateY: toastAnim }], backgroundColor: toast.type === 'error' ? '#ef4444' : '#10b981' }]}>
          <Ionicons name={toast.type === 'error' ? "alert-circle" : "checkmark-circle"} size={24} color="#fff" />
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      )}

      <Modal visible={!!selectedNotice} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.expandedBox, {backgroundColor: theme.bg, borderColor: theme.border}]}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedNotice(null)}>
              <Ionicons name="close-circle" size={32} color={theme.subText} />
            </TouchableOpacity>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.badge, { backgroundColor: '#3b82f6', alignSelf: 'flex-start', marginBottom: 15 }]}>
                <Text style={styles.badgeText}>{selectedNotice?.category}</Text>
              </View>
              <Text style={[styles.expandedTitle, {color: theme.text}]}>{selectedNotice?.title}</Text>
              <Text style={[styles.timeText, {marginBottom: 20}]}>Posted by {selectedNotice?.author} • {timeAgo(selectedNotice?.createdAt)}</Text>
              <Text style={[styles.expandedDesc, {color: theme.text}]}>{selectedNotice?.description}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showNameModal || isEditingProfile} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, {backgroundColor: theme.card, borderColor: theme.border}]}>
            <Ionicons name="school" size={50} color="#0ea5e9" style={{alignSelf: 'center', marginBottom: 10}}/>
            <Text style={[styles.modalTitle, {color: theme.text}]}>{isEditingProfile ? 'Edit Profile' : 'GCUF Board'}</Text>
            <Text style={[styles.modalSub, {color: theme.subText}]}>{isEditingProfile ? 'Update your display name' : 'Enter your student name to continue'}</Text>
            <TextInput style={[styles.input, {backgroundColor: theme.input, color: theme.text, borderColor: theme.border}]} placeholder="Student Full Name" placeholderTextColor={theme.subText} value={tempName} onChangeText={setTempName} />
            <TouchableOpacity style={styles.publishBtn} onPress={saveUserName}>
              <Text style={styles.publishBtnText}>Save</Text>
            </TouchableOpacity>
            {isEditingProfile && (
              <TouchableOpacity style={{marginTop: 15, alignItems: 'center'}} onPress={() => setIsEditingProfile(false)}>
                <Text style={{color: theme.subText, fontWeight: 'bold'}}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <View style={[styles.header, {borderColor: theme.border}]}>
        <Text style={[styles.headerTitle, {color: theme.text}]}>GCUF Notice Board</Text>
        <TouchableOpacity onPress={() => setActiveTab('profile')}>
          <View style={styles.headerAvatar}>
            <Text style={{color: '#fff', fontWeight: 'bold'}}>{userName.charAt(0)}</Text>
            {isVerifiedAdmin(userName) && (
              <View style={styles.adminDot} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      {activeTab === 'feed' && (
        <View style={styles.screenContainer}>
          <View style={[styles.searchContainer, {backgroundColor: theme.input, borderColor: theme.border}]}>
            <Ionicons name="search" size={20} color={theme.subText} style={{marginRight: 10}} />
            <TextInput style={[styles.searchInput, {color: theme.text}]} placeholder="Search notices..." placeholderTextColor={theme.subText} value={searchQuery} onChangeText={setSearchQuery} />
          </View>
          
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {['All', 'General', 'Urgent', 'Event', 'Saved'].map(filter => (
                <TouchableOpacity key={filter} style={[styles.filterChip, {backgroundColor: theme.card, borderColor: theme.border}, activeFilter === filter && {backgroundColor: '#0ea5e9', borderColor: '#0ea5e9'}]} onPress={() => setActiveFilter(filter)}>
                  <Text style={[styles.filterChipText, {color: theme.subText}, activeFilter === filter && {color: '#fff'}]}>{filter}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.sortRow}>
            <Text style={{color: theme.subText, fontWeight: 'bold', marginRight: 10}}>Sort By:</Text>
            {['newest', 'oldest', 'popular'].map(sort => (
              <TouchableOpacity key={sort} onPress={() => setSortBy(sort)}>
                <Text style={{color: sortBy === sort ? '#0ea5e9' : theme.subText, marginRight: 15, textTransform: 'capitalize'}}>{sort}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <SwipeListView
            data={processedNotices}
            keyExtractor={(item) => item.id}
            renderItem={renderNotice}
            renderHiddenItem={renderHiddenItem}
            leftOpenValue={80} 
            rightOpenValue={-80} 
            contentContainerStyle={{paddingHorizontal: 15, paddingBottom: 20}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={60} color={theme.border} />
                <Text style={{color: theme.subText, fontSize: 18, fontWeight: 'bold', marginTop: 10}}>No notices found.</Text>
              </View>
            }
          />
        </View>
      )}

      {activeTab === 'publish' && (
        <View style={[styles.screenContainer, {padding: 20}]}>
          <Text style={[styles.sectionTitle, {color: theme.text}]}>Draft New Notice</Text>
          <TextInput style={[styles.input, {backgroundColor: theme.input, color: theme.text, borderColor: theme.border}]} placeholder="Notice Title" placeholderTextColor={theme.subText} value={title} onChangeText={setTitle} />
          
          <TextInput style={[styles.input, {height: 140, textAlignVertical: 'top', backgroundColor: theme.input, color: theme.text, borderColor: theme.border, marginBottom: 5}]} placeholder="Write your announcement..." placeholderTextColor={theme.subText} multiline numberOfLines={5} maxLength={500} value={description} onChangeText={setDescription} />
          
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${(description.length / 500) * 100}%`, backgroundColor: description.length > 450 ? '#ef4444' : '#0ea5e9' }]} />
          </View>
          <Text style={[styles.charCount, {color: description.length > 450 ? '#ef4444' : theme.subText}]}>{description.length}/500</Text>
          
          <Text style={[styles.subLabel, {color: theme.subText}]}>Category Type:</Text>
          <View style={styles.categoryRow}>
            {['General', 'Urgent', 'Event'].map((cat) => (
              <TouchableOpacity key={cat} style={[styles.catBtn, {backgroundColor: theme.card, borderColor: theme.border}, category === cat && {backgroundColor: '#0ea5e9', borderColor: '#0ea5e9'}]} onPress={() => setCategory(cat)}>
                <Text style={[{color: theme.subText, fontWeight: 'bold'}, category === cat && {color: '#fff'}]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.publishBtn} onPress={publishNotice}>
            <Ionicons name="paper-plane" size={20} color="#fff" style={{marginRight: 10}} />
            <Text style={styles.publishBtnText}>Publish & Notify All</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'profile' && (
        <View style={[styles.screenContainer, {padding: 20, alignItems: 'center'}]}>
          <View style={styles.bigAvatar}>
            <Text style={styles.bigAvatarText}>{userName.charAt(0)}</Text>
            {isVerifiedAdmin(userName) && (
              <View style={[styles.adminDot, {width: 24, height: 24, borderRadius: 12, right: 0, bottom: 0, borderWidth: 3}]} />
            )}
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={[styles.profileName, {color: theme.text}]}>{userName}</Text>
            {isVerifiedAdmin(userName) && <Ionicons name="checkmark-circle" size={24} color="#0ea5e9" style={{marginLeft: 8}} />}
          </View>
          <Text style={{color: theme.subText, fontSize: 16, marginBottom: 15}}>{isVerifiedAdmin(userName) ? 'Verified Administrator' : 'GCUF Student'}</Text>
          
          <TouchableOpacity style={[styles.editProfileBtn, {backgroundColor: theme.card, borderColor: theme.border}]} onPress={() => {setTempName(userName); setIsEditingProfile(true);}}>
            <Ionicons name="pencil" size={16} color={theme.text} />
            <Text style={{color: theme.text, fontWeight: '600', marginLeft: 6}}>Edit Name</Text>
          </TouchableOpacity>

          <View style={[styles.themeToggleCard, {backgroundColor: theme.card, borderColor: theme.border}]}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Ionicons name={isDarkMode ? "moon" : "sunny"} size={22} color={isDarkMode ? "#a855f7" : "#eab308"} />
              <Text style={{color: theme.text, fontWeight: 'bold', fontSize: 16, marginLeft: 10}}>Dark Mode</Text>
            </View>
            <Switch value={isDarkMode} onValueChange={toggleTheme} trackColor={{ false: "#767577", true: "#0ea5e9" }} thumbColor={"#fff"} />
          </View>
          
          <View style={[styles.statsRow, {backgroundColor: theme.card, borderColor: theme.border}]}>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, {color: theme.text}]}>{savedNotices.length}</Text>
              <Text style={[styles.statLabel, {color: theme.subText}]}>Saved Posts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, {color: theme.text}]}>{notices.filter(n => n.author === userName).length}</Text>
              <Text style={[styles.statLabel, {color: theme.subText}]}>Your Posts</Text>
            </View>
          </View>
        </View>
      )}

      <View style={[styles.bottomNav, {backgroundColor: theme.nav, borderColor: theme.border}]}>
        <TouchableOpacity style={styles.navTab} onPress={() => setActiveTab('feed')}>
          <Ionicons name="home" size={24} color={activeTab === 'feed' ? '#0ea5e9' : theme.subText} />
          <Text style={[styles.navText, {color: theme.subText}, activeTab === 'feed' && {color: '#0ea5e9'}]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navTab} onPress={() => setActiveTab('publish')}>
          <Ionicons name="add-circle" size={28} color={activeTab === 'publish' ? '#0ea5e9' : theme.subText} />
          <Text style={[styles.navText, {color: theme.subText}, activeTab === 'publish' && {color: '#0ea5e9'}]}>Publish</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navTab} onPress={() => setActiveTab('profile')}>
          <Ionicons name="person" size={24} color={activeTab === 'profile' ? '#0ea5e9' : theme.subText} />
          <Text style={[styles.navText, {color: theme.subText}, activeTab === 'profile' && {color: '#0ea5e9'}]}>Profile</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center' },
  adminDot: { position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10b981', borderWidth: 2, borderColor: '#000' },
  screenContainer: { flex: 1 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  subLabel: { marginBottom: 10, marginTop: 15, fontWeight: '600' },
  
  toast: { position: 'absolute', top: Platform.OS === 'ios' ? 40 : 10, left: 20, right: 20, padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', zIndex: 1000, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.3, shadowRadius: 5 },
  toastText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 10 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 15, marginHorizontal: 15, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16 },

  chipScroll: { paddingHorizontal: 15, paddingVertical: 12, maxHeight: 60 },
  filterChip: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1, height: 35 },
  filterChipText: { fontWeight: 'bold', fontSize: 13 },
  
  sortRow: { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 10, alignItems: 'center' },

  input: { padding: 16, borderRadius: 12, marginBottom: 15, fontSize: 16, borderWidth: 1 },
  progressContainer: { height: 4, width: '100%', backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: '100%' },
  charCount: { alignSelf: 'flex-end', fontSize: 12, marginTop: 4, fontWeight: 'bold' },

  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  catBtn: { paddingVertical: 12, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, flex: 1, marginHorizontal: 4, alignItems: 'center' },
  
  publishBtn: { backgroundColor: '#0ea5e9', padding: 18, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  publishBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  card: { padding: 18, borderRadius: 16, marginBottom: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardAuthor: { fontSize: 15, fontWeight: '700' },
  timeText: { color: '#888', fontSize: 12, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  cardTitle: { fontSize: 19, fontWeight: 'bold', marginBottom: 8 },
  cardDesc: { fontSize: 15, lineHeight: 24, marginBottom: 12 },
  
  trendingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#451a03', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 12, borderWidth: 1, borderColor: '#f59e0b' },
  trendingText: { color: '#f59e0b', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingRight: 15 },
  actionText: { marginLeft: 6, fontWeight: 'bold', fontSize: 15 },

  hiddenCardContainer: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, borderRadius: 16, overflow: 'hidden' },
  hiddenBtn: { width: 80, justifyContent: 'center', alignItems: 'center', height: '100%' },
  hiddenLeft: { backgroundColor: '#10b981', alignSelf: 'flex-start' },
  hiddenRight: { backgroundColor: '#ef4444', alignSelf: 'flex-end' },
  hiddenText: { color: '#fff', fontWeight: 'bold', marginTop: 4, fontSize: 13 },

  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },

  bigAvatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center', marginBottom: 15, marginTop: 20 },
  bigAvatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  profileName: { fontSize: 28, fontWeight: 'bold' },
  editProfileBtn: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginBottom: 20, alignItems: 'center' },
  themeToggleCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', padding: 20, borderRadius: 16, borderWidth: 1 },
  statBox: { alignItems: 'center' },
  statNumber: { fontSize: 28, fontWeight: '900', marginBottom: 5 },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },

  bottomNav: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 25 : 15, paddingTop: 12 },
  navTab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 12, marginTop: 4, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '85%', padding: 30, borderRadius: 20, borderWidth: 1 },
  modalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  modalSub: { marginBottom: 25, textAlign: 'center', fontSize: 14 },
  
  expandedBox: { width: '95%', height: '85%', padding: 25, borderRadius: 20, borderWidth: 1 },
  closeBtn: { alignSelf: 'flex-end', marginBottom: 10 },
  expandedTitle: { fontSize: 26, fontWeight: 'bold', marginBottom: 10 },
  expandedDesc: { fontSize: 18, lineHeight: 28 },
});