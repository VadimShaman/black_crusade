// js/battle-init.js
import { db } from './firebase-config.js';
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('initiative-list');

    // Если мы не на странице боя, просто завершаем выполнение
    if (!list) {
        console.warn("Элемент #initiative-list не найден, логика инициативы пропущена.");
        return;
    }

    // Получаем ID боя из URL (например: battle.html?id=123)
    const urlParams = new URLSearchParams(window.location.search);
    const battleId = urlParams.get('id');

    if (battleId) {
        const q = query(collection(db, "battles"), orderBy("initiative", "desc"));

        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach((doc) => {
                const data = doc.data();
                html += `<div class="combatant">${data.name || 'Неизвестный'}</div>`;
            });
            list.innerHTML = html;
        });
    }
});