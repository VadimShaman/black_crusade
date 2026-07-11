// js/main.js
import {
    db, collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, serverTimestamp
} from './firebase-config.js';

// ============================================================
// 1. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ============================================================
document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        // Снимаем активность со всех кнопок и контентов
        document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // Активируем текущие
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.getElementById(`tab-${tabId}`).classList.add('active');
    });
});

// ============================================================
// 2. СОЗДАНИЕ БОЯ
// ============================================================
const battleNameInput = document.getElementById('battle-name-input');
const createBtn = document.getElementById('btn-create-battle');
const connectBtn = document.getElementById('btn-connect-battle');
const battleIdInput = document.getElementById('battle-id-input');
const statusDiv = document.getElementById('battle-status');

createBtn.addEventListener('click', async () => {
    const name = battleNameInput.value.trim() || `Бой ${new Date().toLocaleTimeString()}`;
    try {
        const battleData = {
            name: name,
            createdAt: serverTimestamp(),
            isActive: true,
            turn: 0,
            turnOrder: [],
            currentTurnIndex: 0,
            currentPlayerId: null,
            characters: {},
            log: [],
            isFinished: false
        };
        const docRef = await addDoc(collection(db, 'battles'), battleData);
        statusDiv.innerHTML = `✅ Бой создан! ID: <strong>${docRef.id}</strong>`;
        statusDiv.style.color = '#66aa66';
        battleIdInput.value = docRef.id;
        // Можно сразу перекинуть в боевую комнату
        window.open(`battle.html?id=${docRef.id}`, '_blank');
    } catch (err) {
        statusDiv.innerHTML = `❌ Ошибка: ${err.message}`;
        statusDiv.style.color = '#cc4444';
        console.error(err);
    }
});

connectBtn.addEventListener('click', () => {
    const id = battleIdInput.value.trim();
    if (!id) {
        statusDiv.innerHTML = '⚠️ Введите ID боя';
        statusDiv.style.color = '#ff8800';
        return;
    }
    window.open(`battle.html?id=${id}`, '_blank');
});

// ============================================================
// 3. СПИСОК АКТИВНЫХ БОЁВ (РЕАЛТАЙМ)
// ============================================================
const battlesList = document.getElementById('active-battles-list');

const q = query(collection(db, 'battles'), where('isActive', '==', true));
const unsubscribe = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
        battlesList.innerHTML = '<span style="color:#554444;">Нет активных боёв. Создай новый!</span>';
        return;
    }
    let html = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const charCount = data.characters ? Object.keys(data.characters).length : 0;
        html += `
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                <span>${data.name || 'Без названия'}</span>
                <span style="color:#887777;">
                    ${charCount} перс. | Раунд ${data.turn || 0}
                    <button class="tab-btn" style="padding:2px 12px; font-size:12px; margin-left:8px;" 
                            onclick="window.open('battle.html?id=${doc.id}','_blank')">Войти</button>
                </span>
            </div>
        `;
    });
    battlesList.innerHTML = html;
}, (err) => {
    battlesList.innerHTML = `<span style="color:#cc4444;">Ошибка: ${err.message}</span>`;
});

// Очистка подписки при уходе
window.addEventListener('beforeunload', () => {
    if (unsubscribe) unsubscribe();
});

console.log('🔥 Black Crusade Hub загружен!');