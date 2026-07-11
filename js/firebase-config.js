import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBVFjbiXDIQbgntZYeEDY3nB63zs8Q4gNk",
    authDomain: "bc-battle-tracker.firebaseapp.com",
    projectId: "bc-battle-tracker",
    storageBucket: "bc-battle-tracker.firebasestorage.app",
    messagingSenderId: "666897001453",
    appId: "1:666897001453:web:0be0f79154f8e10b4115e4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

signInAnonymously(auth).catch((err) => console.warn("Варп-ошибка:", err));

export {
    db,
    auth,
    collection,
    addDoc,
    onSnapshot,
    query,
    where,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp
};