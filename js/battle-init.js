// js/battle-init.js
import { db } from './firebase-config.js';
import {
    doc, getDoc, updateDoc, deleteField, arrayUnion,
    onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import {
    subscribeToBattle,
    addCharacter,
    rollInitiative,
    nextTurn,
    performAttack,
    addLog,
    finishBattle,
    exportBattle,
    getBattle,
    NPC_TEMPLATES
} from './battle/battle-core.js';

// ============================================================
// СОСТОЯНИЕ
// ============================================================
const state = {
    battleId: null,
    battleData: null,
    selectedAttackerId: null,
    selectedDefenderId: null,
    unsubscribe: null
};

// Получаем ID из URL
const urlParams = new URLSearchParams(window.location.search);
state.battleId = urlParams.get('id');

if (!state.battleId) {
    document.body.innerHTML = `
        <div style="padding:40px; text-align:center; color:#cc4444;">
            ❌ ID боя не указан в URL<br>
            <a href="index.html" style="color:#ff8800;">Вернуться на главную</a>
        </div>
    `;
    throw new Error('ID боя не указан');
}

// ============================================================
// DOM-ЭЛЕМЕНТЫ
// ============================================================
const $ = (id) => document.getElementById(id);

const initiativeList = $('initiativeList');
const logContainer = $('logContainer');
const turnDisplay = $('turnDisplay');
const currentTurnDisplay = $('currentTurnDisplay');
const activeChars = $('activeChars');
const battleIdDisplay = $('battleIdDisplay');
const battleNameDisplay = $('battleNameDisplay');
const calcResult = $('calcResult');
const attackerSelect = $('attackerSelect');
const defenderSelect = $('defenderSelect');
const weaponSelect = $('weaponSelect');
const rangeMod = $('rangeMod');
const fullAttackCheck = $('fullAttackCheck');
const allOutAttackCheck = $('allOutAttackCheck');

// ============================================================
// РЕНДЕРИНГ
// ============================================================
function render(data) {
    if (!data) return;
    state.battleData = data;

    const chars = data.characters || {};
    const turnOrder = data.turnOrder || [];
    const currentIndex = data.currentTurnIndex || 0;

    // Информация
    const activeCount = Object.values(chars).filter(c => c.isActive !== false).length;
    activeChars.textContent = activeCount;
    turnDisplay.textContent = data.turn || 0;
    battleIdDisplay.textContent = state.battleId;
    battleNameDisplay.textContent = data.name || 'Бой без названия';

    const currentId = turnOrder[currentIndex]?.id;
    const currentChar = currentId ? chars[currentId] : null;
    currentTurnDisplay.textContent = currentChar ? currentChar.name : '—';

    // Список инициативы
    if (turnOrder.length === 0) {
        initiativeList.innerHTML = '<span style="color:#554444;">Инициатива не брошена</span>';
    } else {
        let html = '';
        let attackerHtml = '<option value="">Атакующий</option>';
        let defenderHtml = '<option value="">Цель</option>';

        for (const entry of turnOrder) {
            const char = chars[entry.id];
            if (!char) continue;
            const isActive = char.isActive !== false;
            const isDead = char.status === 'dead';
            const isCurrent = entry.id === currentId;
            const woundsClass = char.wounds < char.maxWounds * 0.25 ? 'low' : '';

            html += `
                <div class="init-item ${isCurrent ? 'active' : ''} ${isDead ? 'dead' : ''}"
                     data-charid="${entry.id}">
                    <span class="char-name">${char.name || 'Безымянный'}</span>
                    <span>
                        <span class="char-wounds ${woundsClass}">${isDead ? '💀' : `${char.wounds}/${char.maxWounds}`}</span>
                        <span class="status-badge ${char.status || 'alive'}">${char.status || 'alive'}</span>
                        <span style="color:#887777; font-size:12px;">(Ини: ${entry.initiative || 0})</span>
                    </span>
                </div>
            `;

            // Заполняем селекты для атаки
            if (isActive && !isDead) {
                const label = `${char.name}${char.playerName ? ` (${char.playerName})` : ''}`;
                attackerHtml += `<option value="${entry.id}">${label}</option>`;
                defenderHtml += `<option value="${entry.id}">${label}</option>`;
            }
        }

        initiativeList.innerHTML = html;
        attackerSelect.innerHTML = attackerHtml;
        defenderSelect.innerHTML = defenderHtml;

        // Клик по персонажу — выбор в селектах
        document.querySelectorAll('.init-item[data-charid]').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.charid;
                if (attackerSelect.querySelector(`option[value="${id}"]`)) {
                    attackerSelect.value = id;
                }
                if (defenderSelect.querySelector(`option[value="${id}"]`)) {
                    defenderSelect.value = id;
                }
            });
        });
    }

    // Лог
    renderLog(data.log || []);
}

function renderLog(log) {
    if (!log || log.length === 0) {
        logContainer.innerHTML = '<span style="color:#554444;">Лог пуст</span>';
        return;
    }
    let html = '';
    for (const entry of log) {
        const time = entry.time || '--:--:--';
        let cls = 'log-entry';
        if (entry.damage) cls += ' damage';
        if (entry.isSystem) cls += ' system';
        if (entry.isCritical) cls += ' critical';
        const text = entry.text || entry.message || JSON.stringify(entry);
        html += `<div class="${cls}"><span class="time">[${time}]</span> ${text}</div>`;
    }
    logContainer.innerHTML = html;
    logContainer.scrollTop = logContainer.scrollHeight;
}

// ============================================================
// ПОДПИСКА НА БОЙ
// ============================================================
state.unsubscribe = subscribeToBattle(state.battleId, (data) => {
    if (!data) {
        document.body.innerHTML = `
            <div style="padding:40px; text-align:center; color:#cc4444;">
                ❌ Бой не найден или удалён<br>
                <a href="index.html" style="color:#ff8800;">Вернуться на главную</a>
            </div>
        `;
        return;
    }
    render(data);
});

// ============================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================

// Инициатива
$('rollInitiativeBtn').addEventListener('click', async () => {
    try {
        const result = await rollInitiative(state.battleId);
        await addLog(state.battleId, {
            time: new Date().toLocaleTimeString(),
            text: `🎲 Инициатива: ${result.map((r, i) => `${i + 1}. ${r.name} (${r.initiative})`).join(' → ')}`,
            isSystem: true
        });
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
});

// Следующий ход
$('nextTurnBtn').addEventListener('click', async () => {
    try {
        await nextTurn(state.battleId);
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
});

// Завершить бой
$('finishBattleBtn').addEventListener('click', async () => {
    if (!confirm('Завершить бой? Это действие необратимо.')) return;
    try {
        await finishBattle(state.battleId);
        alert('Бой завершён!');
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
});

// Добавить NPC
$('addNpcBtn').addEventListener('click', async () => {
    const template = document.getElementById('npcTemplateSelect').value;
    const npc = { ...NPC_TEMPLATES[template] };
    if (!npc) {
        alert('Шаблон не найден');
        return;
    }
    const name = prompt('Имя NPC (оставьте пустым для шаблонного):', npc.name);
    if (name !== null && name.trim()) {
        npc.name = name.trim();
    }
    try {
        await addCharacter(state.battleId, npc, 'GM');
        await addLog(state.battleId, {
            time: new Date().toLocaleTimeString(),
            text: `👹 Призван ${npc.name}`,
            isSystem: true
        });
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
});

// Добавить игрока
$('addPlayerBtn').addEventListener('click', async () => {
    const name = prompt('Имя персонажа:', 'Воин Хаоса');
    if (!name) return;
    const playerName = prompt('Имя игрока:', 'Игрок') || 'Игрок';
    const char = {
        name: name,
        ws: 30, bs: 30, s: 30, t: 30, ag: 30, int: 30, per: 30, wp: 30, fel: 30,
        wounds: 12, maxWounds: 12,
        armor: { head: 0, body: 2, arms: 0, legs: 0 },
        weapon: 'Кулак',
        traits: [],
        status: 'alive',
        isNPC: false
    };
    try {
        await addCharacter(state.battleId, char, playerName);
        await addLog(state.battleId, {
            time: new Date().toLocaleTimeString(),
            text: `👤 ${name} (${playerName}) вступил в бой`,
            isSystem: true
        });
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
});

// Атака
$('attackBtn').addEventListener('click', async () => {
    const attackerId = attackerSelect.value;
    const defenderId = defenderSelect.value;
    const weapon = weaponSelect.value === 'default' ? 'Кулак' : weaponSelect.value;

    if (!attackerId || !defenderId) {
        alert('Выберите атакующего и цель');
        return;
    }
    if (attackerId === defenderId) {
        alert('Нельзя атаковать самого себя');
        return;
    }

    const rangeModVal = parseInt(rangeMod.value) || 0;
    const isFull = fullAttackCheck.checked;
    const isAllOut = allOutAttackCheck.checked;

    try {
        const result = await performAttack(state.battleId, attackerId, defenderId, {
            weapon: weapon,
            rangeModifier: rangeModVal,
            isFullAttack: isFull,
            isAllOutAttack: isAllOut
        });

        // Отображаем результат
        const data = state.battleData;
        const attacker = data.characters[attackerId];
        const defender = data.characters[defenderId];
        let resultHtml = `
            <div><strong>${attacker?.name || '?'}</strong> → <strong>${defender?.name || '?'}</strong></div>
            <div>Бросок: <span class="${result.isSuccess ? 'hit' : 'miss'}">${result.roll}</span> (Цель: ${result.target})</div>
            <div>Успехов: ${result.isSuccess ? '+' : ''}${result.degrees}${result.isCritSuccess ? ' ⭐ КРИТИЧЕСКИЙ УСПЕХ!' : ''}${result.isCritFail ? ' 💥 КРИТИЧЕСКИЙ ПРОВАЛ!' : ''}</div>
            <div>Место: ${result.hitLocation}</div>
            <div>Базовый урон: ${result.baseDamage} | Броня: ${result.armorValue} (Пен: ${result.pen || 0}) → Урон: <strong>${result.finalDamage}</strong></div>
        `;
        if (result.isCritical) {
            resultHtml += `<div class="crit">🔥 КРИТИЧЕСКОЕ ПОПАДАНИЕ!</div>`;
        }
        calcResult.style.display = 'block';
        calcResult.innerHTML = resultHtml;

    } catch (err) {
        alert('Ошибка атаки: ' + err.message);
    }
});

// Экспорт
$('exportBtn').addEventListener('click', async () => {
    try {
        const data = await exportBattle(state.battleId);
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `battle_${state.battleId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Ошибка экспорта: ' + err.message);
    }
});

// Импорт
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const { id, ...battleData } = data;
        const docRef = await addDoc(collection(db, 'battles'), {
            ...battleData,
            importedAt: serverTimestamp(),
            isActive: true
        });
        window.location.href = `battle.html?id=${docRef.id}`;
    } catch (err) {
        alert('Ошибка импорта: ' + err.message);
    }
});

// Очистка при уходе
window.addEventListener('beforeunload', () => {
    if (state.unsubscribe) state.unsubscribe();
});

console.log('🔥 Боевая комната загружена! ID:', state.battleId);