// js/battle/battle-log.js
import { db } from '../firebase-config.js';
import { doc, updateDoc, arrayUnion, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ============================================================
// 1. ДОБАВЛЕНИЕ ЗАПИСИ В ЛОГ
// ============================================================
export async function addLog(battleId, entry) {
    const battleRef = doc(db, 'battles', battleId);
    await updateDoc(battleRef, {
        log: arrayUnion({
            ...entry,
            timestamp: new Date().toISOString()
        })
    });
}

// ============================================================
// 2. ПОДПИСКА НА ЛОГ
// ============================================================
export function subscribeToLog(battleId, callback) {
    const docRef = doc(db, 'battles', battleId);
    return onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            callback(data.log || []);
        }
    });
}