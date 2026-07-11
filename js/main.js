import { db, collection, addDoc, onSnapshot, query, where, serverTimestamp } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("🔥 Black Crusade Hub загружен!");

    // Логика отображения списка боев
    const battlesList = document.getElementById('active-battles-list');
    if (battlesList) {
        const q = query(collection(db, 'battles'), where('isActive', '==', true));
        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                html += `
                    <div style="padding:10px; border-bottom:1px solid #333;">
                        <strong>${data.name}</strong>
                        <button onclick="window.location.href='battle.html?id=${doc.id}'">Войти</button>
                    </div>`;
            });
            battlesList.innerHTML = html || 'Активных боёв нет.';
        });
    }

    // Логика создания боя
    const createBtn = document.getElementById('btn-create-battle');
    const input = document.getElementById('battle-name-input');

    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const name = input ? input.value.trim() : "Без названия";
            try {
                await addDoc(collection(db, 'battles'), {
                    name: name,
                    isActive: true,
                    createdAt: serverTimestamp()
                });
                alert("Бой создан!");
            } catch (e) { console.error("Ошибка Firebase:", e); }
        });
    }
});