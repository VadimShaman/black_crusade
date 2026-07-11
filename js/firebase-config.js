// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, doc, addDoc, updateDoc, onSnapshot, getDoc, deleteDoc,
    query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Безопасное извлечение переменных с защитой от undefined при сборке Vite
const getEnvValue = (key) => {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        if (import.meta.env[key]) return import.meta.env[key];
    }
    if (typeof window !== 'undefined' && window[key]) {
        return window[key];
    }
    return "";
};

const firebaseConfig = {
    apiKey: getEnvValue("VITE_FIREBASE_API_KEY"),
    authDomain: getEnvValue("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: getEnvValue("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: getEnvValue("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getEnvValue("VITE_FIREBASE_APP_ID")
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Анонимная авторизация для доступа к Firestore
signInAnonymously(auth)
    .then(() => console.log("✦ Подключение к Варпу успешно установлено (Firebase Auth) ✦"))
    .catch((err) => console.warn("Ошибка авторизации в Варпе:", err));

// Единый чистый экспорт для всех модулей (включая main.js)
export { 
    db, auth, collection, doc, addDoc, updateDoc, onSnapshot, getDoc, deleteDoc,
    query, where, serverTimestamp 
};