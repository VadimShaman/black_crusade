// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, doc, addDoc, updateDoc, onSnapshot, getDoc, deleteDoc,
    query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const getEnvValue = (viteValue, windowKey) => {
    if (typeof viteValue !== 'undefined' && viteValue !== '') return viteValue;
    if (typeof window !== 'undefined' && window[windowKey]) return window[windowKey];
    return "";
};

const firebaseConfig = {
    apiKey: getEnvValue(import.meta.env.VITE_FIREBASE_API_KEY, "VITE_FIREBASE_API_KEY"),
    authDomain: getEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: getEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, "VITE_FIREBASE_PROJECT_ID"),
    storageBucket: getEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, "VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, "VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getEnvValue(import.meta.env.VITE_FIREBASE_APP_ID, "VITE_FIREBASE_APP_ID")
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

signInAnonymously(auth)
    .then(() => console.log("✦ Подключение к Варпу успешно установлено (Firebase Auth) ✦"))
    .catch((err) => console.warn("Ошибка авторизации в Варпе:", err));

// Экспортируем абсолютно всё в одном месте
export { 
    db, auth, collection, doc, addDoc, updateDoc, onSnapshot, getDoc, deleteDoc,
    query, where, serverTimestamp 
};