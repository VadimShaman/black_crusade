// js/main.js
import { db, collection, onSnapshot, query, where } from './firebase-config.js';

const battlesList = document.getElementById('active-battles-list');

if (battlesList) {
    console.log("DEBUG: Подписка на коллекцию battles...");
    const q = query(collection(db, 'battles'), where('isActive', '==', true));
    
    onSnapshot(q, (snapshot) => {
        console.log("DEBUG: Получено документов:", snapshot.size);
        
        if (snapshot.empty) {
            battlesList.innerHTML = '<p style="color:red;">База пуста или нет активных боёв.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log("DEBUG: Рендер боя:", data.name);
            html += `<div class="battle-card">Бой: ${data.name}</div>`;
        });
        battlesList.innerHTML = html;
    });
} else {
    console.error("DEBUG: Элемент #active-battles-list НЕ НАЙДЕН в HTML!");
}