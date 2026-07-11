import { db, collection, addDoc } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOM загружен, ищем элементы...");
    
    const createBtn = document.getElementById('btn-create-battle');
    const nameInput = document.getElementById('battle-name-input');
    
    if (!createBtn) console.error("DEBUG: Кнопка #btn-create-battle НЕ НАЙДЕНА!");
    if (!nameInput) console.error("DEBUG: Поле #battle-name-input НЕ НАЙДЕНО!");

    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            console.log("DEBUG: Клик по кнопке!");
            const name = nameInput ? nameInput.value.trim() : "Без имени";
            
            try {
                console.log("DEBUG: Отправляем в Firebase:", name);
                await addDoc(collection(db, 'battles'), {
                    name: name,
                    isActive: true,
                    turn: 1
                });
                console.log("DEBUG: УСПЕХ!");
                alert("Бой создан!");
            } catch (err) {
                console.error("DEBUG: ОШИБКА FIREBASE:", err);
            }
        });
    }
});