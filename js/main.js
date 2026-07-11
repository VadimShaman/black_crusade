// js/main.js
import { db, collection, addDoc, onSnapshot, query, where, serverTimestamp } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("🔥 Black Crusade Hub загружен!");

    // 1. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabContent = document.getElementById(`tab-${btn.dataset.tab}`);
            if (tabContent) tabContent.classList.add('active');
        });
    });

    // 2. СОЗДАНИЕ БОЯ
    const createBtn = document.getElementById('btn-create-battle');
    const battleNameInput = document.getElementById('battle-name-input');

    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const name = battleNameInput ? battleNameInput.value.trim() : "Без названия";
            console.log("DEBUG: Попытка создания боя:", name);

            try {
                await addDoc(collection(db, 'battles'), {
                    name: name,
                    isActive: true,
                    turn: 1,
                    createdAt: serverTimestamp()
                });
                console.log("DEBUG: Бой успешно создан");
                alert("Бой создан!");
                if (battleNameInput) battleNameInput.value = '';
            } catch (err) {
                console.error("DEBUG: ОШИБКА FIREBASE:", err);
            }
        });
    }

    // 3. СПИСОК БОЁВ
    const battlesList = document.getElementById('active-battles-list');
    if (battlesList) {
        const q = query(collection(db, 'battles'), where('isActive', '==', true));
        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                html += `
                    <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span>${data.name || 'Без названия'}</span>
                        <button onclick="window.open('battle.html?id=${doc.id}','_blank')">Войти</button>
                    </div>`;
            });
            battlesList.innerHTML = html || 'Нет активных боёв.';
        });
    }
});