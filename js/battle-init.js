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
    // === КУБЫ ===
    document.getElementById('dice-d100')?.addEventListener('click', () => {
        const result = Math.floor(Math.random() * 100) + 1;
        addLogEntry(`🎲 d100: <span class="dice-roll">${result}</span>`, 'system');
    });
    document.getElementById('dice-d10')?.addEventListener('click', () => {
        const result = Math.floor(Math.random() * 10) + 1;
        addLogEntry(`🎲 d10: <span class="dice-roll">${result}</span>`, 'system');
    });
    document.getElementById('dice-d5')?.addEventListener('click', () => {
        const result = Math.floor(Math.random() * 5) + 1;
        addLogEntry(`🎲 d5: <span class="dice-roll">${result}</span>`, 'system');
    });
    document.getElementById('dice-custom')?.addEventListener('click', () => {
        const sides = parseInt(document.getElementById('dice-custom-input').value) || 20;
        const result = Math.floor(Math.random() * sides) + 1;
        addLogEntry(`🎲 d${sides}: <span class="dice-roll">${result}</span>`, 'system');
    });

    // === ЗАМЕТКИ ===
    document.getElementById('save-notes-btn')?.addEventListener('click', () => {
        const notes = document.getElementById('gm-notes').value;
        localStorage.setItem(`battle_${battleId}_notes`, notes);
        addLogEntry('📝 Заметки сохранены', 'system');
    });

    // Восстановить заметки при загрузке
    const savedNotes = localStorage.getItem(`battle_${battleId}_notes`);
    if (savedNotes) document.getElementById('gm-notes').value = savedNotes;

    // === СЧЁТЧИК УБИЙСТВ ===
    let killCount = 0;
    export function incrementKills() {
        killCount++;
        document.getElementById('kill-counter').textContent = killCount;
    }
});