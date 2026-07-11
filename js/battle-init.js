import { db } from './firebase-config.js';
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('initiative-list');
    if (!list) return; // Если страницы нет, просто выходим

    const q = query(collection(db, "battles"), orderBy("initiative", "desc"));

    onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        snapshot.forEach((doc) => {
            const data = doc.data();
            list.innerHTML += `<div class="combatant">${data.name || 'Неизвестный'}</div>`;
        });
    });
});