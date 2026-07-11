// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, addDoc, updateDoc, onSnapshot, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Безопасная проверка окружения, чтобы избежать ошибки "Cannot read properties of undefined"
const getEnv = (key) => {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            return import.meta.env[key];
        }
    } catch (e) {
        // Игнорируем ошибку в средах, где import.meta не поддерживается базовым браузером
    }
    return window[key] || "";
};

const firebaseConfig = {
    apiKey: getEnv("VITE_FIREBASE_API_KEY"),
    authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getEnv("VITE_FIREBASE_APP_ID")
};

// Проверяем, удалось ли загрузить конфигурацию
if (!firebaseConfig.apiKey) {
    console.warn("⚠️ Внимание: Конфигурация Firebase пуста. Если вы запускаете сайт локально, убедитесь, что ключи подгружены.");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

signInAnonymously(auth)
    .then(() => console.log("✦ Подключение к Варпу успешно установлено (Firebase Auth) ✦"))
    .catch((err) => console.warn("Ошибка авторизации в Варпе:", err));

export { db, auth, collection, doc, addDoc, updateDoc, onSnapshot, getDoc, deleteDoc };
