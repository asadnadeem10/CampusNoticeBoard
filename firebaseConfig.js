// firebase/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCSZPBfLfJ52vkhSYWDvNgGk8SfpL2F3ro",
  authDomain: "campusnoticeboard2.firebaseapp.com",
  projectId: "campusnoticeboard2",
  storageBucket: "campusnoticeboard2.firebasestorage.app",
  messagingSenderId: "113863896312",
  appId: "1:113863896312:web:d157568c554a6786a8df0d"
};

const app = initializeApp(firebaseConfig);

// This 'export' is what allows the other screens to find 'db'
export const db = getFirestore(app);