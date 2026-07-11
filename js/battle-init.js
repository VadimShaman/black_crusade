import { db } from './firebase-config.js';
import { doc, onSnapshot, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const battleId = params.get('id');
    const titleEl = document.getElementById('battle-title');
    const idDisplay = document.getElementById('battle-id-display');

    if (battleId && titleEl) {
        idDisplay.innerText = `ID: ${battleId}`;

        // Слушаем данные конкретного боя
        onSnapshot(doc(db, 'battles', battleId), (doc) => {
            if (doc.exists()) {
                titleEl.innerText = `Сражение: ${doc.data().name}`;
            }
        });
    }

    // Обработка формы добавления участника
    const form = document.getElementById('add-combatant-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('combatant-name').value;
            const init = document.getElementById('combatant-init').value;

            // Отправляем в подколлекцию combatants конкретного боя
            await addDoc(collection(db, 'battles', battleId, 'combatants'), {
                name: name,
                initiative: parseInt(init),
                hp: parseInt(document.getElementById('combatant-hp').value),
                type: document.getElementById('combatant-type').value
            });
            form.reset();
        });
    }
});