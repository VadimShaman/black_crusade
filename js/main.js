// js/main.js
import { db, collection, onSnapshot, query, where, addDoc, serverTimestamp, deleteDoc, doc, getDoc } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const battlesList = document.getElementById('active-battles-list');
    const createBtn = document.getElementById('btn-create-battle');
    const nameInput = document.getElementById('battle-name-input');

    // ============================================================
    // 1. ОТРИСОВКА СПИСКА БОЁВ
    // ============================================================
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
                        <div class="battle-card" style="border:1px solid #4a0000; padding:10px; margin:5px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                            <span>⚔️ ${data.name || 'Бой'}</span>
                            <div style="display:flex; gap:6px;">
                                <button class="tab-btn" onclick="window.location.href='./battle.html?id=${bId}'" style="padding:4px 12px;">Войти</button>
                                <button class="tab-btn" onclick="window.deleteBattle('${bId}')" style="background:#4a0000; color:#fff; padding:4px 12px; border-color:#7a0000;">🗑️ Удалить</button>
                            </div>
                        </div>`;
                });
            }
            battlesList.innerHTML = html + '</div>';
        });
    }

    // ============================================================
    // 2. УДАЛЕНИЕ БОЯ (С ДВОЙНОЙ ПРОВЕРКОЙ)
    // ============================================================
    window.deleteBattle = async (id) => {
        if (!id || id === 'undefined') return;

        try {
            // Получаем данные боя, чтобы узнать его название
            const battleSnap = await getDoc(doc(db, 'battles', id));
            if (!battleSnap.exists()) {
                alert('❌ Бой не найден');
                return;
            }
            const battleName = battleSnap.data().name || 'Без названия';

            // Первое подтверждение
            if (!confirm(`⚠️ Вы уверены, что хотите удалить бой "${battleName}"?\nЭто действие НЕОБРАТИМО.`)) {
                return;
            }

            // Второе подтверждение — ввод названия
            const userInput = prompt(
                `Для подтверждения удаления введите название боя:\n"${battleName}"`,
                ''
            );

            if (userInput === null) {
                // Пользователь нажал "Отмена"
                return;
            }

            if (userInput.trim() !== battleName) {
                alert('❌ Название введено неверно. Удаление отменено.');
                return;
            }

            // Финальное удаление
            await deleteDoc(doc(db, 'battles', id));
            alert(`✅ Бой "${battleName}" удалён.`);

        } catch (e) {
            console.error('Ошибка удаления:', e);
            alert('❌ Ошибка при удалении боя: ' + e.message);
        }
    };

    // ============================================================
    // 3. СОЗДАНИЕ БОЯ
    // ============================================================
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const name = nameInput ? nameInput.value.trim() : "Новый бой";
            if (!name) {
                alert('Введите название боя');
                return;
            }
            try {
                await addDoc(collection(db, 'battles'), {
                    name: name,
                    isActive: true,
                    createdAt: serverTimestamp()
                });
                if (nameInput) nameInput.value = '';
            } catch (e) {
                console.error('Ошибка создания:', e);
                alert('Ошибка создания боя: ' + e.message);
            }
        });
    }
});