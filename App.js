import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import * as ReactNative from 'react-native';
import {
  Alert,
  Animated,
  FlatList,
  Image,
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

import { decode } from 'base64-arraybuffer';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';

// 🔥 SUPABASE IMPORT
import { supabase } from './supabaseClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets(); 

  // --- CORE STATE ---
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [activeTab, setActiveTab] = useState('feed'); 
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true); 
  const [refreshing, setRefreshing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true); 
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All'); 
  const [selectedNotice, setSelectedNotice] = useState(null); 
  const [actionSheetNotice, setActionSheetNotice] = useState(null);
  const [savedNotices, setSavedNotices] = useState([]);
  
  // --- UI STATE ---
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [toastAnim] = useState(new Animated.Value(-100));
  const scrollY = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const skeletonAnim = useRef(new Animated.Value(0.3)).current; 
  const navAnimFeed = useRef(new Animated.Value(1)).current;
  const navAnimProfile = useRef(new Animated.Value(1)).current;
  const listRef = useRef(null); 

  // --- AUTH STATE ---
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState(''); 
  const [authPassword, setAuthPassword] = useState('');
  const [authAvatar, setAuthAvatar] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // --- EDIT PROFILE STATE ---
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // --- PUBLISH & EDIT NOTICE STATE ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [targetAudience, setTargetAudience] = useState('All Students');
  const [image, setImage] = useState(null);
  const [eventDate, setEventDate] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState(null);

  // --- HIG THEME ENGINE ---
  const theme = isDarkMode ? {
    bg: '#000000', surface: '#1C1C1E', card: '#1C1C1E', text: '#FFFFFF', subText: '#8E8E93', 
    border: '#38383A', primary: '#0A84FF', accent: '#5E5CE6', danger: '#FF453A', warning: '#FF9F0A',
    segmentedBg: '#1C1C1E', segmentedThumb: '#2C2C2E'
  } : {
    bg: '#F2F2F7', surface: '#FFFFFF', card: '#FFFFFF', text: '#000000', subText: '#8E8E93', 
    border: '#E5E5EA', primary: '#007AFF', accent: '#5856D6', danger: '#FF3B30', warning: '#FF9500',
    segmentedBg: '#E5E5EA', segmentedThumb: '#FFFFFF'
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      else setCurrentUser(null);
    });

    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(skeletonAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          Animated.timing(skeletonAnim, { toValue: 0.2, duration: 800, useNativeDriver: true })
        ])
      ])
    ).start();

    fetchNotices();
    const subscription = supabase.channel('public:notices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, payload => { fetchNotices(); })
      .subscribe();

    return () => { supabase.removeChannel(subscription); }
  }, []);

  const fetchUserProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setCurrentUser(data);
  };

  const fetchNotices = async () => {
    const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false });
    if (data) {
      const mappedData = data.map(doc => ({
        id: doc.id, title: doc.title, description: doc.description, category: doc.category,
        targetAudience: doc.target_audience, author: doc.author, authorAvatar: doc.author_avatar,
        isPinned: doc.is_pinned, likedBy: doc.liked_by || [], rsvps: doc.rsvps || [],
        imageUrl: doc.image_url, eventDate: doc.event_date, createdAt: new Date(doc.created_at)
      }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNotices(mappedData);
    }
    setIsLoading(false);
  };

  // --- AUTHENTICATION ---
  const pickAuthAvatar = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true
    });
    if (!result.canceled) setAuthAvatar(result.assets[0]);
  };

  const handleAuth = async () => {
    if (!authEmail || !authPassword) return showToast('Email and Password required.', 'error');
    if (authPassword.length < 6) return showToast('Password must be 6+ chars.', 'error');
    
    setIsAuthenticating(true);
    try {
      if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
      } else {
        if (!authName) throw new Error("Full Name is required.");
        const { data: authData, error: authError } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (authError) throw authError;

        let avatarUrl = null;
        if (authAvatar && authAvatar.base64) {
          const filePath = `${authData.user.id}_avatar.jpg`;
          const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, decode(authAvatar.base64), { contentType: 'image/jpeg', upsert: true });
          if (!uploadError) {
            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            avatarUrl = data.publicUrl;
          }
        }
        await supabase.from('profiles').insert([{ id: authData.user.id, full_name: authName, roll_no: authEmail.split('@')[0].toUpperCase(), avatar_url: avatarUrl, role: 'student' }]);
      }
    } catch (error) { showToast(error.message, 'error'); }
    setIsAuthenticating(false);
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await supabase.auth.signOut();
    setCurrentUser(null);
    setAuthEmail(''); setAuthPassword('');
  };

  // --- EDIT PROFILE LOGIC ---
  const openEditProfile = () => {
    Haptics.selectionAsync();
    setEditName(currentUser?.full_name || '');
    setEditAvatar(null);
    setIsEditModalVisible(true);
  };

  const pickEditAvatar = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true
    });
    if (!result.canceled) setEditAvatar(result.assets[0]);
  };

  const saveProfileUpdates = async () => {
    if (!editName.trim()) return showToast('Name cannot be empty.', 'error');
    setIsUpdatingProfile(true);
    try {
      let finalAvatarUrl = currentUser.avatar_url;
      if (editAvatar && editAvatar.base64) {
        const filePath = `${currentUser.id}_avatar_${Date.now()}.jpg`;
        await supabase.storage.from('avatars').upload(filePath, decode(editAvatar.base64), { contentType: 'image/jpeg', upsert: true });
        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        finalAvatarUrl = data.publicUrl;
      }
      await supabase.from('profiles').update({ full_name: editName, avatar_url: finalAvatarUrl }).eq('id', currentUser.id);
      await supabase.from('notices').update({ author: editName, author_avatar: finalAvatarUrl }).eq('author', currentUser.full_name);
      
      setCurrentUser({ ...currentUser, full_name: editName, avatar_url: finalAvatarUrl });
      setIsEditModalVisible(false);
      showToast('Profile Updated');
      fetchNotices(); 
    } catch (error) { showToast(error.message, 'error'); } 
    finally { setIsUpdatingProfile(false); }
  };

  // --- UTILS ---
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const timeAgo = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds / 86400 > 1) return Math.floor(seconds / 86400) + 'd ago';
    if (seconds / 3600 > 1) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds / 60 > 1) return Math.floor(seconds / 60) + 'm ago';
    return 'Just now';
  };

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    Animated.spring(toastAnim, { toValue: insets.top > 0 ? insets.top + 10 : 40, friction: 5, tension: 40, useNativeDriver: true }).start();
    setTimeout(() => { Animated.timing(toastAnim, { toValue: -150, duration: 300, useNativeDriver: true }).start(() => setToast({ visible: false, message: '', type: 'success' })); }, 3000);
  };

  const switchTab = (tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
    if (tab === 'publish' && !editingNoticeId) resetPublishForm(); 
    setActiveTab(tab);
    if (tab === 'feed') { navAnimFeed.setValue(0.8); Animated.spring(navAnimFeed, { toValue: 1, friction: 5, useNativeDriver: true }).start(); }
    if (tab === 'profile' || tab === 'dashboard') { navAnimProfile.setValue(0.8); Animated.spring(navAnimProfile, { toValue: 1, friction: 5, useNativeDriver: true }).start(); }
  };

  // --- PUBLISH & EDIT LOGIC ---
  const resetPublishForm = () => {
    setTitle(''); setDescription(''); setCategory('General'); setImage(null); setEventDate(''); setEditingNoticeId(null);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.6, base64: true });
    if (!result.canceled) setImage(result.assets[0]);
  };

  const loadNoticeIntoEditor = (item) => {
    setTitle(item.title);
    setDescription(item.description);
    setCategory(item.category);
    setEventDate(item.eventDate || '');
    setImage(item.imageUrl ? { uri: item.imageUrl, isRemote: true } : null);
    setEditingNoticeId(item.id);
    switchTab('publish');
  };

  const publishNotice = async () => {
    if (!title || !description) return showToast('Fill all fields.', 'error');
    setIsUploading(true);
    let finalImageUrl = image?.isRemote ? image.uri : null;

    try {
      if (image && image.base64) {
        const filePath = `${Date.now()}_poster.jpg`;
        await supabase.storage.from('notice_images').upload(filePath, decode(image.base64), { contentType: 'image/jpeg', upsert: true });
        const { data } = supabase.storage.from('notice_images').getPublicUrl(filePath);
        finalImageUrl = data.publicUrl;
      }

      if (editingNoticeId) {
        await supabase.from('notices').update({
          title, description, category, target_audience: targetAudience,
          image_url: finalImageUrl, event_date: category === 'Event' ? eventDate : null
        }).eq('id', editingNoticeId);
        showToast('Notice Updated Successfully!');
      } else {
        await supabase.from('notices').insert([{
          title, description, category, target_audience: targetAudience,
          author: currentUser.full_name, author_avatar: currentUser.avatar_url,
          is_pinned: false, liked_by: [], rsvps: [], image_url: finalImageUrl, event_date: category === 'Event' ? eventDate : null
        }]);
        showToast('Broadcast Dispatched');
      }
      
      resetPublishForm();
      setIsUploading(false); 
      setActiveTab('feed');
      fetchNotices();
    } catch (error) { setIsUploading(false); showToast(`Failed: ${error.message}`, 'error'); }
  };

  const deleteNotice = async (id) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await supabase.from('notices').delete().eq('id', id);
    showToast('Notice Deleted Permanently', 'error');
    fetchNotices();
  };

  const handleMoreAction = (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'ios') {
      let options = ['Cancel', 'Share Notice'];
      let destructiveButtonIndex = null;
      if (isAdmin) { options.push('Delete Notice'); destructiveButtonIndex = 2; }
      
      ReactNative.ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 0, destructiveButtonIndex }, (buttonIndex) => {
        if (buttonIndex === 1) Share.share({ message: `${item.title}\n\n${item.description}` });
        if (buttonIndex === 2 && isAdmin) deleteNotice(item.id);
      });
    } else {
      if(isAdmin) {
        Alert.alert("Manage Notice", "What would you like to do?", [
          {text: "Cancel", style: "cancel"}, {text: "Share", onPress: () => Share.share({ message: item.title })},
          {text: "Delete", style: "destructive", onPress: () => deleteNotice(item.id)}
        ]);
      } else {
        Share.share({ message: `${item.title}\n\n${item.description}` });
      }
    }
  };

  const togglePin = async (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await supabase.from('notices').update({ is_pinned: !item.isPinned }).eq('id', item.id);
  };

  const toggleBookmark = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newSaves = savedNotices.includes(id) ? savedNotices.filter(saveId => saveId !== id) : [...savedNotices, id];
    setSavedNotices(newSaves);
  };

  const likeNotice = async (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
    const hasLiked = item.likedBy.includes(currentUser?.full_name);
    const newLikedBy = hasLiked ? item.likedBy.filter(n => n !== currentUser?.full_name) : [...item.likedBy, currentUser?.full_name];
    await supabase.from('notices').update({ liked_by: newLikedBy }).eq('id', item.id);
  };

  const rsvpToEvent = async (item) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const hasRsvpd = item.rsvps?.includes(currentUser?.full_name);
    const newRsvps = hasRsvpd ? item.rsvps.filter(n => n !== currentUser?.full_name) : [...(item.rsvps || []), currentUser?.full_name];
    await supabase.from('notices').update({ rsvps: newRsvps }).eq('id', item.id);
  };

  // --- DATA PROCESSING ---
  const isAdmin = currentUser?.role === 'admin';
  const totalLikes = notices.reduce((sum, notice) => sum + (notice.likedBy?.length || 0), 0);
  const totalRsvps = notices.reduce((sum, notice) => sum + (notice.rsvps?.length || 0), 0);
  const urgentCount = notices.filter(n => n.category === 'Urgent').length;
  const eventCount = notices.filter(n => n.category === 'Event').length;
  
  const FILTER_OPTIONS = ['All', 'Events', 'Urgent', 'Saved'];
  
  let processedNotices = notices.filter(notice => {
    const matchesSearch = (notice.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (activeFilter === 'All') return matchesSearch;
    if (activeFilter === 'Saved') return matchesSearch && savedNotices.includes(notice.id);
    if (activeFilter === 'Events') return matchesSearch && notice.category === 'Event';
    return matchesSearch && notice.category === activeFilter;
  });

  processedNotices.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  // --- UI INTERPOLATIONS ---
  const headerOpacity = scrollY.interpolate({ inputRange: [0, 40], outputRange: [1, 0], extrapolate: 'clamp' });
  const compactTitleOpacity = scrollY.interpolate({ inputRange: [40, 60], outputRange: [0, 1], extrapolate: 'clamp' });

  // --- RENDER NOTICE CARD ---
  const renderNotice = ({ item }) => {
    let catColor = theme.primary; let catIcon = 'megaphone';
    if (item.category === 'Urgent') { catColor = theme.danger; catIcon = 'alert-circle'; }
    if (item.category === 'Event') { catColor = '#34C759'; catIcon = 'calendar'; }
    
    const hasLiked = item.likedBy && item.likedBy.includes(currentUser?.full_name);
    const hasRsvpd = item.rsvps && item.rsvps.includes(currentUser?.full_name);
    const isSaved = savedNotices.includes(item.id);

    return (
      <View style={styles.rowPadding}>
        <View style={styles.frontShadowBox}>
          <View style={[styles.frontCardInner, { backgroundColor: theme.card, borderColor: item.isPinned ? theme.warning : theme.border, borderWidth: item.isPinned ? 1.5 : 0.5 }]}>
            
            <View style={styles.cardHeader}>
              <View style={styles.authorRow}>
                <View style={[styles.avatar, {backgroundColor: theme.border}]}>
                  {item.authorAvatar ? ( <Image source={{uri: item.authorAvatar}} style={{width: '100%', height: '100%'}} /> ) : (
                    <Text style={{color: '#fff', fontWeight: '800', fontSize: 18}}>{item.author ? item.author.charAt(0) : 'A'}</Text>
                  )}
                </View>
                <View>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Text style={[styles.cardAuthor, {color: theme.text}]}>{item.author}</Text>
                    {isAdmin && <MaterialCommunityIcons name="check-decagram" size={16} color={theme.primary} style={{marginLeft: 4}} />}
                  </View>
                  <Text style={{color: theme.subText, fontSize: 13, fontWeight: '500', marginTop: 2}}>{timeAgo(item.createdAt)}</Text>
                </View>
              </View>
              <TouchableOpacity hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} onPress={() => { Haptics.selectionAsync(); setActionSheetNotice(item); }}>
                <Ionicons name="ellipsis-horizontal" size={20} color={theme.subText} />
              </TouchableOpacity>
            </View>

            <Pressable onPress={() => setSelectedNotice(item)}>
              <Text style={[styles.cardTitle, {color: theme.text}]} numberOfLines={2}>{item.title}</Text>
              
              {item.imageUrl && (
                <View style={styles.cardImageContainer}>
                  <Image source={{uri: item.imageUrl}} style={styles.cardImage} resizeMode="contain" />
                </View>
              )}
              
              <Text style={[styles.cardDesc, {color: theme.text}]} numberOfLines={3}>{item.description}</Text>
            </Pressable>

            {item.category === 'Event' && (
              <View style={[styles.eventBlock, {backgroundColor: theme.segmentedBg}]}>
                <View style={{flex: 1}}>
                  <Text style={{color: theme.text, fontWeight: '700', fontSize: 15}}>{item.eventDate || 'Date TBD'}</Text>
                  <Text style={{color: theme.subText, fontSize: 13, marginTop: 2}}>{item.rsvps?.length || 0} Going</Text>
                </View>
                <TouchableOpacity style={[styles.rsvpBtn, hasRsvpd && {backgroundColor: theme.primary, borderColor: theme.primary}]} onPress={() => rsvpToEvent(item)}>
                  <Text style={[styles.rsvpBtnText, hasRsvpd && {color: '#fff'}]}>{hasRsvpd ? 'Going ✓' : 'Going'}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.cardFooter, {borderColor: theme.border}]}>
              <View style={styles.actionRow}>
                <TouchableOpacity hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} style={styles.actionBtn} onPress={() => likeNotice(item)}>
                  <Ionicons name={hasLiked ? "heart" : "heart-outline"} size={26} color={hasLiked ? theme.danger : theme.text} />
                  <Text style={[styles.actionText, hasLiked ? {color: theme.danger} : {color: theme.text}]}>{item.likedBy?.length || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} style={styles.actionBtn} onPress={() => toggleBookmark(item.id)}>
                  <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={24} color={isSaved ? theme.primary : theme.text} />
                </TouchableOpacity>
              </View>
              {item.isPinned && (
                <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: theme.warning+'15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8}}>
                  <Ionicons name="pin" size={12} color={theme.warning} />
                  <Text style={{fontSize: 12, fontWeight: '700', color: theme.warning, marginLeft: 4}}>PINNED</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderSkeleton = () => (
    <Animated.View style={[styles.rowPadding, { opacity: skeletonAnim }]}>
      <View style={[styles.frontCardInner, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
        <View style={styles.cardHeader}><View style={[styles.avatar, {backgroundColor: theme.border}]} /></View>
        <View style={{width: '85%', height: 24, backgroundColor: theme.border, borderRadius: 8, marginBottom: 16}} />
        <View style={{width: '100%', height: 16, backgroundColor: theme.border, borderRadius: 8, marginBottom: 8}} />
      </View>
    </Animated.View>
  );

  // --- IF NOT LOGGED IN ---
  if (!session) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.authContainer, {backgroundColor: theme.bg}]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
        <Text style={[styles.authTitle, {color: theme.text}]}>NoticeBoard</Text>
        <Text style={[styles.authSub, {color: theme.subText, marginBottom: 35}]}>{isLoginMode ? 'Sign in to access your campus.' : 'Create an account to join.'}</Text>

        {!isLoginMode && (
          <TouchableOpacity onPress={pickAuthAvatar} style={styles.avatarUploadBtn}>
            {authAvatar ? ( <Image source={{uri: authAvatar.uri}} style={{width: 100, height: 100, borderRadius: 50}} /> ) : (
              <View style={[styles.avatarPlaceholder, {backgroundColor: theme.surface, borderColor: theme.border}]}><Ionicons name="camera" size={32} color={theme.subText} /></View>
            )}
          </TouchableOpacity>
        )}

        <ScrollView keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 20}}>
          {!isLoginMode && <TextInput style={[styles.authInput, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border}]} placeholder="Full Name" placeholderTextColor={theme.subText} value={authName} onChangeText={setAuthName} clearButtonMode="while-editing" returnKeyType="next" />}
          
          <TextInput style={[styles.authInput, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border}]} placeholder="University Email" placeholderTextColor={theme.subText} value={authEmail} onChangeText={setAuthEmail} autoCapitalize="none" keyboardType="email-address" clearButtonMode="while-editing" returnKeyType="next" />
          <TextInput style={[styles.authInput, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, marginBottom: 30}]} placeholder="Password" placeholderTextColor={theme.subText} value={authPassword} onChangeText={setAuthPassword} secureTextEntry clearButtonMode="while-editing" returnKeyType="done" />

          <TouchableOpacity style={[styles.authSubmitBtn, {backgroundColor: theme.primary, opacity: isAuthenticating ? 0.7 : 1}]} onPress={handleAuth} disabled={isAuthenticating}>
            <Text style={styles.authSubmitText}>{isAuthenticating ? 'Processing...' : (isLoginMode ? 'Sign In' : 'Sign Up')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{marginTop: 25, alignItems: 'center'}} onPress={() => { Haptics.selectionAsync(); setIsLoginMode(!isLoginMode); }}>
            <Text style={{color: theme.primary, fontWeight: '600', fontSize: 16}}>{isLoginMode ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // --- MAIN APP RENDER ---
  return (
    <View style={[styles.container, {backgroundColor: theme.bg}]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      
      {toast.visible && (
        <Animated.View style={[styles.toast, { transform: [{ translateY: toastAnim }], backgroundColor: toast.type === 'error' ? theme.danger : theme.surface }]}>
          <Text style={[styles.toastText, {color: toast.type === 'error' ? '#fff' : theme.text}]}>{toast.message}</Text>
        </Animated.View>
      )}

      {/* UNIVERSAL CUSTOM ACTION SHEET */}
      <Modal visible={!!actionSheetNotice} animationType="fade" transparent={true}>
        <TouchableOpacity style={styles.actionOverlay} activeOpacity={1} onPress={() => setActionSheetNotice(null)}>
          <View style={[styles.actionSheetInner, {backgroundColor: theme.surface}]}>
            <TouchableOpacity style={[styles.actionSheetBtn, {borderBottomColor: theme.border, borderBottomWidth: 0.5}]} onPress={() => { Share.share({ message: `${actionSheetNotice?.title}\n\n${actionSheetNotice?.description}` }); setActionSheetNotice(null); }}>
              <Text style={[styles.actionSheetText, {color: theme.primary}]}>Share Notice</Text>
            </TouchableOpacity>
            
            {isAdmin && (
              <>
                <TouchableOpacity style={[styles.actionSheetBtn, {borderBottomColor: theme.border, borderBottomWidth: 0.5}]} onPress={() => { loadNoticeIntoEditor(actionSheetNotice); setActionSheetNotice(null); }}>
                  <Text style={[styles.actionSheetText, {color: theme.text}]}>Edit Notice</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionSheetBtn]} onPress={() => { deleteNotice(actionSheetNotice.id); setActionSheetNotice(null); }}>
                  <Text style={[styles.actionSheetText, {color: theme.danger}]}>Delete Notice</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          <TouchableOpacity style={[styles.actionSheetInner, {backgroundColor: theme.surface, marginTop: 10}]} onPress={() => setActionSheetNotice(null)}>
             <View style={styles.actionSheetBtn}><Text style={[styles.actionSheetText, {color: theme.primary, fontWeight: '700'}]}>Cancel</Text></View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.pageSheetContent, {backgroundColor: theme.bg, height: '100%', paddingTop: 20, paddingHorizontal: 25}]}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30}}>
            <Text style={{color: theme.text, fontSize: 32, fontWeight: '800', letterSpacing: -1}}>Edit Profile</Text>
            <TouchableOpacity hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} onPress={() => setIsEditModalVisible(false)}><View style={{backgroundColor: theme.surface, padding: 8, borderRadius: 20}}><Ionicons name="close" size={24} color={theme.subText} /></View></TouchableOpacity>
          </View>
          <ScrollView keyboardDismissMode="interactive">
            <View style={{alignItems: 'center', marginBottom: 30}}>
              <TouchableOpacity onPress={pickEditAvatar} style={{position: 'relative'}}>
                <View style={[styles.bigAvatar, {backgroundColor: theme.surface, width: 120, height: 120, borderRadius: 60}]}>
                  {editAvatar ? ( <Image source={{uri: editAvatar.uri}} style={{width: '100%', height: '100%'}} /> ) : currentUser?.avatar_url ? ( <Image source={{uri: currentUser.avatar_url}} style={{width: '100%', height: '100%'}} /> ) : ( <Ionicons name="person" size={50} color={theme.subText} /> )}
                </View>
                <View style={{position: 'absolute', bottom: 0, right: 0, backgroundColor: theme.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: theme.bg}}><Ionicons name="camera" size={20} color="#fff" /></View>
              </TouchableOpacity>
            </View>
            <Text style={[styles.subLabel, {color: theme.text}]}>Full Name</Text>
            <TextInput style={[styles.input, {backgroundColor: theme.surface, color: theme.text, borderColor: theme.border}]} value={editName} onChangeText={setEditName} clearButtonMode="while-editing" />
            <TouchableOpacity style={[styles.publishBtn, {backgroundColor: theme.primary, marginTop: 20, opacity: isUpdatingProfile ? 0.6 : 1}]} onPress={saveProfileUpdates} disabled={isUpdatingProfile}>
              <Text style={styles.publishBtnText}>{isUpdatingProfile ? 'Saving Changes...' : 'Save Profile'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* READING MODAL */}
      <Modal visible={!!selectedNotice} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.pageSheetContent, {backgroundColor: theme.bg, height: '100%', paddingTop: 30, paddingHorizontal: 25}]}>
          <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 20}}>
             <TouchableOpacity hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} onPress={() => setSelectedNotice(null)}><View style={{backgroundColor: theme.surface, padding: 8, borderRadius: 20}}><Ionicons name="close" size={24} color={theme.subText} /></View></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.expandedTitle, {color: theme.text}]}>{selectedNotice?.title}</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 25, borderBottomWidth: 0.5, borderColor: theme.border, paddingBottom: 25}}>
              <View style={[styles.avatar, {backgroundColor: theme.surface, width: 48, height: 48, borderRadius: 24, overflow: 'hidden'}]}>
                {selectedNotice?.authorAvatar ? (
                  <Image source={{uri: selectedNotice.authorAvatar}} style={{width: '100%', height: '100%'}} />
                ) : (
                  <Text style={{color: theme.text, fontWeight: '700', fontSize: 18}}>{selectedNotice?.author?.charAt(0) || 'A'}</Text>
                )}
              </View>
              <View style={{marginLeft: 15}}>
                <Text style={{color: theme.text, fontWeight: '700', fontSize: 17}}>{selectedNotice?.author}</Text>
                <Text style={{color: theme.subText, marginTop: 4, fontWeight: '500', fontSize: 14}}>{timeAgo(selectedNotice?.createdAt)}</Text>
              </View>
            </View>
            
            {selectedNotice?.imageUrl && (
              <View style={styles.expandedImageContainer}>
                <Image source={{uri: selectedNotice.imageUrl}} style={styles.expandedImage} resizeMode="contain" />
              </View>
            )}

            <Text style={[styles.expandedDesc, {color: theme.text}]}>{selectedNotice?.description}</Text>
            <View style={{height: 100}} />
          </ScrollView>
        </View>
      </Modal>

      {/* LARGE DYNAMIC HEADER */}
      {activeTab === 'feed' ? (
        <View style={{zIndex: 10}}>
          <BlurView intensity={isDarkMode ? 80 : 100} tint={Platform.OS === 'ios' ? (isDarkMode ? "prominent" : "prominent") : (isDarkMode ? "dark" : "light")} style={[StyleSheet.absoluteFill, {borderBottomWidth: 0.5, borderColor: theme.border}]} />
          <View style={{paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end'}}>
            <Animated.View style={{opacity: headerOpacity}}>
              <Text style={{color: theme.subText, fontSize: 15, fontWeight: '600', textTransform: 'uppercase'}}>{getGreeting()}</Text>
              <Text style={[styles.headerTitle, {color: theme.text}]}>Campus Feed</Text>
            </Animated.View>
            <Animated.View style={{position: 'absolute', bottom: 15, left: 20, opacity: compactTitleOpacity}}>
               <Text style={{color: theme.text, fontSize: 18, fontWeight: '800'}}>Campus Feed</Text>
            </Animated.View>
            <TouchableOpacity onPress={() => switchTab('profile')}>
              <View style={[styles.headerAvatar, {backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center'}]}>
                {currentUser?.avatar_url ? (
                  <Image source={{uri: currentUser.avatar_url}} style={{width: '100%', height: '100%'}} />
                ) : (
                  <Ionicons name="person" size={20} color={theme.subText} />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.staticHeader, {backgroundColor: theme.bg, paddingTop: insets.top + 20}]}>
          <Text style={{color: theme.text, fontSize: 34, fontWeight: '800', letterSpacing: -1}}>
            {activeTab === 'publish' ? (editingNoticeId ? 'Edit Notice' : 'New Notice') : activeTab === 'dashboard' ? 'Command Center' : 'Profile'}
          </Text>
        </View>
      )}

      {/* FEED TAB */}
      {activeTab === 'feed' && (
        <View style={styles.screenContainer}>
          {isLoading ? ( <View style={{padding: 20}}>{renderSkeleton()}{renderSkeleton()}</View> ) : (
            <FlatList
              ref={listRef} data={processedNotices} keyExtractor={(item) => item.id}
              renderItem={renderNotice}
              keyboardDismissMode="interactive"
              contentContainerStyle={{paddingHorizontal: 15, paddingBottom: 140 + insets.bottom, paddingTop: 10}} 
              onScroll={Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {useNativeDriver: false})}
              scrollEventThrottle={16}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchNotices} tintColor={theme.subText} />}
              ListHeaderComponent={
                <View style={{marginBottom: 15, marginHorizontal: 5}}>
                  <View style={[styles.searchContainer, {backgroundColor: theme.segmentedBg}]}>
                    <Ionicons name="search" size={20} color={theme.subText} style={{marginRight: 10}} />
                    <TextInput style={[styles.searchInput, {color: theme.text}]} placeholder="Search" placeholderTextColor={theme.subText} value={searchQuery} onChangeText={setSearchQuery} clearButtonMode="while-editing" returnKeyType="search" />
                  </View>
                  
                  <View style={[styles.segmentedControl, {backgroundColor: theme.segmentedBg}]}>
                    {FILTER_OPTIONS.map((filter) => {
                      const isActive = activeFilter === filter;
                      return (
                        <TouchableOpacity key={filter} style={[styles.segmentBtn, isActive && {backgroundColor: theme.segmentedThumb, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2}]} onPress={() => { Haptics.selectionAsync(); setActiveFilter(filter); }}>
                          <Text style={[styles.segmentText, {color: isActive ? theme.text : theme.subText}]}>{filter}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="documents-outline" size={60} color={theme.border} />
                  <Text style={{color: theme.subText, fontSize: 17, marginTop: 15, fontWeight: '600'}}>No notices found.</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* PUBLISH & EDIT TAB */}
      {activeTab === 'publish' && isAdmin && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screenContainer}>
          <ScrollView keyboardDismissMode="interactive" contentContainerStyle={{padding: 20, paddingBottom: 140 + insets.bottom}}>
            <TextInput style={[styles.input, {backgroundColor: theme.surface, color: theme.text}]} placeholder="Title" placeholderTextColor={theme.subText} value={title} onChangeText={setTitle} clearButtonMode="while-editing" />
            <TextInput style={[styles.input, {height: 160, textAlignVertical: 'top', backgroundColor: theme.surface, color: theme.text}]} placeholder="Description" placeholderTextColor={theme.subText} multiline value={description} onChangeText={setDescription} />
            
            <Text style={[styles.subLabel, {color: theme.subText}]}>PRIORITY</Text>
            <View style={styles.categoryRow}>
              {['General', 'Event', 'Urgent'].map((cat) => (
                 <TouchableOpacity key={cat} style={[styles.catBtn, {backgroundColor: theme.surface}, category === cat && {borderColor: theme.primary, borderWidth: 2}]} onPress={() => {Haptics.selectionAsync(); setCategory(cat)}}>
                   <Text style={[{color: theme.text, fontWeight: '600'}, category === cat && {color: theme.primary, fontWeight: '800'}]}>{cat}</Text>
                 </TouchableOpacity>
              ))}
            </View>

            {category === 'Event' && <TextInput style={[styles.input, {backgroundColor: theme.surface, color: theme.text}]} placeholder="Event Date" placeholderTextColor={theme.subText} value={eventDate} onChangeText={setEventDate} clearButtonMode="while-editing" />}

            <Text style={[styles.subLabel, {color: theme.subText}]}>MEDIA</Text>
            <TouchableOpacity style={[styles.uploadBox, {backgroundColor: theme.surface}]} onPress={pickImage}>
              {image ? <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="contain" /> : <Ionicons name="image" size={32} color={theme.subText} />}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.publishBtn, {backgroundColor: theme.primary, opacity: isUploading ? 0.6 : 1}]} onPress={publishNotice} disabled={isUploading}>
              <Text style={styles.publishBtnText}>{isUploading ? 'Publishing...' : (editingNoticeId ? 'Update Notice' : 'Publish Notice')}</Text>
            </TouchableOpacity>
            
            {editingNoticeId && (
               <TouchableOpacity style={{marginTop: 20, alignItems: 'center'}} onPress={resetPublishForm}>
                 <Text style={{color: theme.danger, fontWeight: '600', fontSize: 16}}>Cancel Editing</Text>
               </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* SUPERCHARGED DASHBOARD TAB */}
      {activeTab === 'dashboard' && isAdmin && (
        <ScrollView style={styles.screenContainer} contentContainerStyle={{padding: 20, paddingBottom: 140 + insets.bottom}}>
          
          <Text style={[styles.subLabel, {color: theme.text, fontSize: 18, marginBottom: 15}]}><Ionicons name="analytics" size={18}/> Network Overview</Text>

          <View style={styles.gridContainer}>
            <View style={styles.gridRow}>
              <View style={[styles.dashboardCard, {backgroundColor: theme.surface}]}><Ionicons name="document-text" size={28} color={theme.primary} /><Text style={[styles.dashboardNum, {color: theme.text}]}>{notices.length}</Text><Text style={styles.dashboardLabel}>Total Posts</Text></View>
              <View style={[styles.dashboardCard, {backgroundColor: theme.surface}]}><Ionicons name="people" size={28} color={theme.accent} /><Text style={[styles.dashboardNum, {color: theme.text}]}>{totalLikes}</Text><Text style={styles.dashboardLabel}>Total Likes</Text></View>
            </View>
            <View style={styles.gridRow}>
              <View style={[styles.dashboardCard, {backgroundColor: theme.surface}]}><Ionicons name="flame" size={28} color={theme.danger} /><Text style={[styles.dashboardNum, {color: theme.text}]}>{urgentCount}</Text><Text style={styles.dashboardLabel}>Urgent Alerts</Text></View>
              <View style={[styles.dashboardCard, {backgroundColor: theme.surface}]}><Ionicons name="calendar" size={28} color={'#34C759'} /><Text style={[styles.dashboardNum, {color: theme.text}]}>{eventCount}</Text><Text style={styles.dashboardLabel}>Active Events</Text></View>
            </View>
            <View style={styles.gridRow}>
              <View style={[styles.dashboardCard, {backgroundColor: theme.surface}]}><Ionicons name="checkmark-done-circle" size={28} color={theme.warning} /><Text style={[styles.dashboardNum, {color: theme.text}]}>{totalRsvps}</Text><Text style={styles.dashboardLabel}>Total Going</Text></View>
            </View>
          </View>
        </ScrollView>
      )}

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <ScrollView style={styles.screenContainer} contentContainerStyle={{padding: 20, alignItems: 'center', paddingBottom: 140 + insets.bottom}}>
          <View style={[styles.idCard, {backgroundColor: theme.surface}]}>
            <TouchableOpacity hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} style={{position: 'absolute', top: 15, right: 15, padding: 8, backgroundColor: theme.bg, borderRadius: 20}} onPress={openEditProfile}><Ionicons name="pencil" size={18} color={theme.text} /></TouchableOpacity>
            <View style={[styles.bigAvatar, {backgroundColor: theme.bg}]}>
              {currentUser?.avatar_url ? (
                <Image source={{uri: currentUser.avatar_url}} style={{width: '100%', height: '100%'}} />
              ) : (
                <Ionicons name="person" size={50} color={theme.subText} />
              )}
            </View>
            <Text style={[styles.profileName, {color: theme.text}]}>{currentUser?.full_name}</Text>
            <Text style={{color: theme.subText, fontSize: 16, marginTop: 4}}>{currentUser?.roll_no}</Text>
          </View>
          
          <View style={[styles.insetGroup, {backgroundColor: theme.surface}]}>
            <View style={[styles.insetItem, {borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border}]}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}><Ionicons name="moon" size={24} color={theme.accent} /><Text style={{color: theme.text, fontSize: 17, marginLeft: 15}}>Dark Appearance</Text></View>
              <Switch value={isDarkMode} onValueChange={() => setIsDarkMode(!isDarkMode)} />
            </View>
            <TouchableOpacity style={styles.insetItem} onPress={handleLogout}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}><Ionicons name="log-out" size={24} color={theme.danger} /><Text style={{color: theme.danger, fontSize: 17, marginLeft: 15}}>Sign Out</Text></View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Web-Safe FLOATING NAV */}
      <View style={[styles.floatingNavContainer, { bottom: insets.bottom > 0 ? insets.bottom : 20 }]}>
        <BlurView intensity={isDarkMode ? 80 : 100} tint={Platform.OS === 'ios' ? (isDarkMode ? "prominent" : "prominent") : (isDarkMode ? "dark" : "light")} style={[styles.floatingNav, {borderColor: theme.border, borderWidth: 0.5}]}>
          <TouchableOpacity hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} style={styles.navTab} onPress={() => switchTab('feed')}><Ionicons name={activeTab === 'feed' ? "home" : "home-outline"} size={26} color={activeTab === 'feed' ? theme.primary : theme.subText} /></TouchableOpacity>
          {isAdmin && <TouchableOpacity hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} style={styles.navTab} onPress={() => switchTab('dashboard')}><Ionicons name={activeTab === 'dashboard' ? "stats-chart" : "stats-chart-outline"} size={26} color={activeTab === 'dashboard' ? theme.primary : theme.subText} /></TouchableOpacity>}
          {isAdmin && <TouchableOpacity hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} style={styles.navTab} onPress={() => switchTab('publish')}><Ionicons name={activeTab === 'publish' ? "add-circle" : "add-circle-outline"} size={32} color={theme.primary} /></TouchableOpacity>}
          <TouchableOpacity hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} style={styles.navTab} onPress={() => switchTab('profile')}><Ionicons name={activeTab === 'profile' ? "person" : "person-outline"} size={26} color={activeTab === 'profile' ? theme.primary : theme.subText} /></TouchableOpacity>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  authContainer: { flex: 1, justifyContent: 'center', padding: 30 },
  authTitle: { fontSize: 40, fontWeight: '800', letterSpacing: -1.5, textAlign: 'center' },
  authSub: { fontSize: 17, marginTop: 8, textAlign: 'center' },
  avatarUploadBtn: { alignItems: 'center', marginBottom: 30 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  authInput: { padding: 20, borderRadius: 14, fontSize: 17, marginBottom: 15 },
  authSubmitBtn: { padding: 20, borderRadius: 14, alignItems: 'center' },
  authSubmitText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  screenContainer: { flex: 1 },
  toast: { position: 'absolute', alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', zIndex: 1000, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  toastText: { fontWeight: '600', fontSize: 15, marginLeft: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderRadius: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 17 },
  segmentedControl: { flexDirection: 'row', padding: 3, borderRadius: 10 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  rowPadding: { paddingVertical: 8, backgroundColor: 'transparent' },
  frontShadowBox: { shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  frontCardInner: { padding: 20, borderRadius: 20, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  cardAuthor: { fontSize: 17, fontWeight: '700', letterSpacing: -0.5 },
  cardTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, lineHeight: 26, letterSpacing: -0.5 },
  cardDesc: { fontSize: 16, lineHeight: 24, marginBottom: 15 },
  cardImageContainer: { width: '100%', aspectRatio: 4/3, borderRadius: 12, marginBottom: 15, overflow: 'hidden', backgroundColor: 'transparent' },
  cardImage: { width: '100%', height: '100%' },
  expandedImageContainer: { width: '100%', aspectRatio: 1, borderRadius: 16, marginBottom: 20, overflow: 'hidden', backgroundColor: 'transparent' },
  expandedImage: { width: '100%', height: '100%' },
  eventBlock: { padding: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  rsvpBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#007AFF' },
  rsvpBtnText: { fontWeight: '700', color: '#007AFF', fontSize: 14 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 15 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingRight: 24 },
  actionText: { marginLeft: 6, fontWeight: '600', fontSize: 16 },
  subLabel: { fontSize: 13, fontWeight: '700', marginTop: 15, marginBottom: 8, marginLeft: 5, letterSpacing: 0.5 },
  input: { padding: 18, borderRadius: 14, marginBottom: 20, fontSize: 17 },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  catBtn: { paddingVertical: 14, borderRadius: 12, flex: 1, marginHorizontal: 4, alignItems: 'center' },
  uploadBox: { height: 200, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 25, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%' },
  publishBtn: { padding: 18, borderRadius: 14, alignItems: 'center', shadowOffset: {width:0,height:4}, shadowOpacity: 0.2, shadowRadius: 8 },
  publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  idCard: { width: '100%', padding: 30, borderRadius: 20, alignItems: 'center', marginBottom: 25 },
  bigAvatar: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 15, overflow: 'hidden' },
  profileName: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  insetGroup: { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 10 },
  insetItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  gridContainer: { width: '100%' },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  dashboardCard: { flex: 1, padding: 20, borderRadius: 16, marginHorizontal: 5 },
  dashboardNum: { fontSize: 32, fontWeight: '800', marginTop: 10, letterSpacing: -1 },
  dashboardLabel: { color: '#8E8E93', fontSize: 13, fontWeight: '700', marginTop: 4 },
  floatingNavContainer: { position: 'absolute', left: 25, right: 25, shadowOffset: {width:0, height:8}, shadowOpacity: 0.15, shadowRadius: 20 },
  floatingNav: { flexDirection: 'row', borderRadius: 25, paddingVertical: 12, justifyContent: 'space-around', alignItems: 'center', overflow: 'hidden' },
  navTab: { alignItems: 'center', justifyContent: 'center', width: 60 },
  pageSheetContent: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  expandedTitle: { fontSize: 30, fontWeight: '800', marginBottom: 20, lineHeight: 36, letterSpacing: -1 },
  expandedDesc: { fontSize: 18, lineHeight: 28 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100, opacity: 0.5 },
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 20 },
  actionSheetInner: { borderRadius: 14, overflow: 'hidden' },
  actionSheetBtn: { paddingVertical: 18, alignItems: 'center' },
  actionSheetText: { fontSize: 20, fontWeight: '600' }
});