import { db, collection, onSnapshot, query, where, addDoc, serverTimestamp, deleteDoc, doc } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const battlesList = document.getElementById('active-battles-list');
    const createBtn = document.getElementById('btn-create-battle');
    const nameInput = document.getElementById('battle-name-input');

    // 1. Отрисовка списка боев
    if (battlesList) {
        const q = query(collection(db, 'battles'), where('isActive', '==', true));
        onSnapshot(q, (snapshot) => {
            let html = '<div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">';
            if (snapshot.empty) {
                html += '<p>Активных сражений в секторе нет.</p>';
            } else {
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    // Найдите этот блок в main.js и замените на этот:
                    html += `
    <div class="battle-card" style="border:1px solid #4a0000; padding:10px; margin:5px 0;">
        <span>⚔️ ${data.name || 'Безымянный конфликт'}</span>
        <button onclick="window.location.href='/battle.html?id=${doc.id}'">Войти</button>
        <button onclick="window.deleteBattle('${doc.id}')" style="background:#400;">Удалить</button>
    </div>`;
                });
            }
            battlesList.innerHTML = html + '</div>';
        });
    }

    // 2. Глобальная функция удаления
    window.deleteBattle = async (id) => {
        if (confirm("Удалить этот бой навсегда?")) {
            await deleteDoc(doc(db, 'battles', id));
        }
    };

    // 3. Создание боя
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const name = nameInput ? nameInput.value.trim() : "Новый бой";
            await addDoc(collection(db, 'battles'), { name, isActive: true, createdAt: serverTimestamp() });
            if (nameInput) nameInput.value = '';
        });
    }
});