import { db, collection, addDoc, onSnapshot, query, where } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("🔥 Black Crusade Hub загружен!");

    const battleNameInput = document.getElementById('battle-name-input');
    const createBtn = document.getElementById('btn-create-battle');
    const battlesList = document.getElementById('active-battles-list');

    // Кнопка создания боя
    if (createBtn && battleNameInput) {
        createBtn.addEventListener('click', async () => {
            const name = battleNameInput.value.trim();
            if (!name) return alert("Введи имя боя!");
            try {
                await addDoc(collection(db, 'battles'), { name, isActive: true, turn: 1 });
                battleNameInput.value = '';
            } catch (e) { console.error("Ошибка:", e); }
        });
    }

    // Список боёв
    if (battlesList) {
        const q = query(collection(db, 'battles'), where('isActive', '==', true));
        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                html += `<div>${data.name} <button onclick="window.open('battle.html?id=${doc.id}','_self')">Войти</button></div>`;
            });
            battlesList.innerHTML = html || 'Нет активных боёв.';
        });
    }
});