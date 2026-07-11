import {
    db, collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, serverTimestamp
} from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("🔥 Black Crusade Hub загружен!");

    // 1. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.dataset.tab;
            const tabContent = document.getElementById(`tab-${tabId}`);
            if (tabContent) tabContent.classList.add('active');
        });
    });

    // 2. СОЗДАНИЕ БОЯ
    const battleNameInput = document.getElementById('battle-name-input');
    const createBtn = document.getElementById('btn-create-battle');
    const battlesList = document.getElementById('active-battles-list');

    if (createBtn && battleNameInput) {
        createBtn.addEventListener('click', async () => {
            const name = battleNameInput.value.trim();
            if (!name) return;
            await addDoc(collection(db, 'battles'), {
                name,
                isActive: true,
                turn: 1,
                createdAt: serverTimestamp()
            });
            battleNameInput.value = '';
        });
    }

    // 3. ПОДПИСКА НА СПИСОК БОЁВ
    if (battlesList) {
        const q = query(collection(db, 'battles'), where('isActive', '==', true));
        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                battlesList.innerHTML = '<span style="color:#554444;">Нет активных боёв. Создай новый!</span>';
                return;
            }
            let html = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                html += `
                    <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span>${data.name || 'Без названия'}</span>
                        <button onclick="window.open('battle.html?id=${doc.id}','_blank')">Войти</button>
                    </div>`;
            });
            battlesList.innerHTML = html;
        });
    }
});