// js/main.js
import {
    db,
    collection,
    addDoc,
    onSnapshot,
    query,
    where,
    serverTimestamp
} from './firebase-config.js';
// Оборачиваем всё в DOMContentLoaded, чтобы ждать полной загрузки HTML
document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOM готов, инициализируем кнопки...");

    const createBtn = document.getElementById('btn-create-battle');
    const battleNameInput = document.getElementById('battle-name-input');

    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const name = battleNameInput ? battleNameInput.value.trim() : "";
            if (!name) {
                alert("Еретик, введи имя боя!");
                return;
            }

            try {
                console.log("DEBUG: Пытаюсь создать бой:", name);
                await addDoc(collection(db, 'battles'), {
                    name: name,
                    isActive: true,
                    turn: 1,
                    createdAt: serverTimestamp()
                });
                alert("Бой создан!");
            } catch (err) {
                console.error("DEBUG: Ошибка записи в Firebase:", err);
            }
        });
    } else {
        console.error("DEBUG: Кнопка #btn-create-battle не найдена на странице!");
    }
});