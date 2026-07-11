import { db, collection, onSnapshot, query, where, addDoc, serverTimestamp, deleteDoc, doc } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const battlesList = document.getElementById('active-battles-list');
    const createBtn = document.getElementById('btn-create-battle');
    const nameInput = document.getElementById('battle-name-input');

    // 1. Отрисовка списка боев
    if (battlesList) {
        const q = query(collection(db, 'battles'), where('isActive', '==', true));
        onSnapshot(q, (snapshot) => {
            let html = '<div class="battle-grid">';
            if (snapshot.empty) {
                html += '<p>Активных сражений в секторе нет.</p>';
            } else {
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    const bId = docSnap.id; 
                    
                    html += `
                        <div class="battle-card" style="border:1px solid #4a0000; padding:10px; margin:5px 0; display:flex; justify-content:space-between;">
                            <span>⚔️ ${data.name || 'Бой'}</span>
                            <div>
                                <button onclick="window.location.href='./battle.html?id=${bId}'">Войти</button>
                                <button onclick="window.deleteBattle('${bId}')" style="background:#400; color:#fff; cursor:pointer;">Удалить</button>
                            </div>
                        </div>`;
                });
            }
            battlesList.innerHTML = html + '</div>';
        });
    }

    // 2. Глобальная функция для удаления
    window.deleteBattle = async (id) => {
        if (!id || id === 'undefined') return;
        if (confirm("Удалить этот бой навсегда?")) {
            try {
                await deleteDoc(doc(db, 'battles', id));
            } catch (e) {
                console.error("Ошибка удаления:", e);
                alert("Ошибка: " + e.message);
            }
        }
    };

    // 3. Создание боя
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const name = nameInput ? nameInput.value.trim() : "Новый бой";
            await addDoc(collection(db, 'battles'), { 
                name, 
                isActive: true, 
                createdAt: serverTimestamp() 
            });
            if (nameInput) nameInput.value = '';
        });
    }
});