import { db, collection, onSnapshot, query, where, addDoc, serverTimestamp } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const battlesList = document.getElementById('active-battles-list');
    const createBtn = document.getElementById('btn-create-battle');
    const nameInput = document.getElementById('battle-name-input');

    // Логика отрисовки списка
    if (battlesList) {
        const q = query(collection(db, 'battles'), where('isActive', '==', true));
        onSnapshot(q, (snapshot) => {
            let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
            if (snapshot.empty) {
                html += '<p>Активных сражений нет.</p>';
            } else {
                snapshot.forEach(doc => {
                    const data = doc.data();
                    html += `
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border: 1px solid #4a0000; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #fff; font-weight: bold;">⚔️ ${data.name || 'Безымянный конфликт'}</span>
                            <button onclick="window.location.href='battle.html?id=${doc.id}'" 
                                    style="background: #8b0000; color: white; border: none; padding: 5px 15px; cursor: pointer; border-radius: 3px;">
                                Войти
                            </button>
                        </div>`;
                });
            }
            html += '</div>';
            battlesList.innerHTML = html;
        });
    }

    // Логика создания
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const name = nameInput ? nameInput.value.trim() : "Новый бой";
            try {
                await addDoc(collection(db, 'battles'), {
                    name: name,
                    isActive: true,
                    createdAt: serverTimestamp()
                });
                if(nameInput) nameInput.value = '';
            } catch (e) { console.error("Ошибка Firebase:", e); }
        });
    }
});