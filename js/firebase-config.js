// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, collection, doc, addDoc, updateDoc, onSnapshot, getDoc, deleteDoc,
    query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Конфигурация твоего проекта bc-battle-tracker
const firebaseConfig = {
    apiKey: "AIzaSyBVFjbiXDIQbgntZYeEDY3nB63zs8Q4gNk",
    authDomain: "bc-battle-tracker.firebaseapp.com",
    projectId: "bc-battle-tracker",
    storageBucket: "bc-battle-tracker.firebasestorage.app",
    messagingSenderId: "666897001453",
    appId: "1:666897001453:web:0be0f79154f8e10b4115e4"
};

// Инициализация сервисов Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Автоматическая анонимная авторизация для бесперебойного доступа к Firestore
signInAnonymously(auth)
    .then(() => console.log("✦ Подключение к Варпу успешно установлено (Firebase Auth) ✦"))
    .catch((err) => console.warn("Ошибка авторизации в Варпе:", err));

// Единый экспорт для подключения в main.js, battle-init.js и других модулях
export {
    db, auth, collection, doc, addDoc, updateDoc, onSnapshot, getDoc, deleteDoc,
    query, where, serverTimestamp
};