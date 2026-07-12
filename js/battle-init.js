// js/battle-init.js
import { db } from './firebase-config.js';
import {
    doc, onSnapshot, collection, addDoc, updateDoc,
    deleteDoc, getDoc, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { NPC_TEMPLATES } from './battle/battle-core.js';

// ============================================================
// 1. СОСТОЯНИЕ
// ============================================================
const state = {
    battleId: null,
    battleData: null,
    unsubscribe: null
};

// Получаем ID из URL
const params = new URLSearchParams(window.location.search);
state.battleId = params.get('id');

if (!state.battleId) {
    document.body.innerHTML = `
        <div style="padding:40px; text-align:center; color:#cc4444;">
            ❌ ID боя не указан в URL<br>
            <a href="/black_crusade/index.html" style="color:#ff8800;">Вернуться на главную</a>
        </div>
    `;
    throw new Error('ID боя не указан');
}

// ============================================================
// 2. DOM-ЭЛЕМЕНТЫ
// ============================================================
const $ = (id) => document.getElementById(id);
const combatantsList = $('combatants-list');
const logContainer = $('battle-log');
const turnDisplay = $('turn-display');
const currentTurnDisplay = $('current-turn-display');
const totalCombatants = $('total-combatants');
const activeCombatants = $('active-combatants');
const killCounter = $('kill-counter');
const battleTitle = $('battle-title');
const battleIdDisplay = $('battle-id-display');
const attackResult = $('attack-result');

// ============================================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function addLogEntry(text, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="time">[${time}]</span> ${text}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function updateCombatants(data) {
    const chars = data.characters || {};
    const turnOrder = data.turnOrder || [];
    const entries = Object.entries(chars);

    totalCombatants.textContent = entries.length;
    activeCombatants.textContent = entries.filter(([_, c]) => c.isActive !== false).length;

    if (entries.length === 0) {
        combatantsList.innerHTML = '<div style="color:#554444; text-align:center; padding:20px;">Нет участников</div>';
        return;
    }

    let html = '';
    for (const [id, char] of entries) {
        const isActive = char.isActive !== false;
        const isDead = char.status === 'dead';
        const isCurrent = turnOrder[data.currentTurnIndex]?.id === id;
        const hpPercent = char.maxWounds ? Math.round((char.wounds / char.maxWounds) * 100) : 100;

        html += `
            <div class="combatant-card ${isCurrent ? 'active-turn' : ''} ${isDead ? 'dead' : ''}" data-id="${id}">
                <div>
                    <strong>${char.name || 'Безымянный'}</strong>
                    ${char.playerName ? `<span style="color:#887777; font-size:12px;">(${char.playerName})</span>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:13px; ${hpPercent < 25 ? 'color:#cc4444;' : ''}">
                        ${isDead ? '💀' : `${char.wounds}/${char.maxWounds}`}
                    </span>
                    <span class="status-badge ${char.status || 'alive'}">${char.status || 'alive'}</span>
                </div>
            </div>
        `;
    }
    combatantsList.innerHTML = html;
}

// ============================================================
// 4. ПОДПИСКА НА БОЙ
// ============================================================
const battleRef = doc(db, 'battles', state.battleId);
state.unsubscribe = onSnapshot(battleRef, (snapshot) => {
    if (!snapshot.exists()) {
        document.body.innerHTML = `
            <div style="padding:40px; text-align:center; color:#cc4444;">
                ❌ Бой не найден или удалён<br>
                <a href="/black_crusade/index.html" style="color:#ff8800;">Вернуться на главную</a>
            </div>
        `;
        return;
    }

    const data = snapshot.data();
    state.battleData = data;
    battleTitle.textContent = `⚔️ ${data.name || 'Сражение'}`;
    battleIdDisplay.textContent = `ID: ${state.battleId}`;
    turnDisplay.textContent = data.turn || 0;
    currentTurnDisplay.textContent = data.turnOrder?.[data.currentTurnIndex]?.name || '—';
    killCounter.textContent = data.kills || 0;

    updateCombatants(data);

    // Лог
    if (data.log && data.log.length > 0) {
        logContainer.innerHTML = '';
        data.log.forEach(entry => {
            const time = entry.time || new Date().toLocaleTimeString();
            const type = entry.isSystem ? 'system' : entry.damage ? 'damage' : '';
            const div = document.createElement('div');
            div.className = `log-entry ${type}`;
            div.innerHTML = `<span class="time">[${time}]</span> ${entry.text}`;
            logContainer.appendChild(div);
        });
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}, (error) => {
    console.error('Ошибка подписки:', error);
    logContainer.innerHTML = '<div style="color:#cc4444;">❌ Ошибка подключения к Firebase</div>';
});

// ============================================================
// 5. ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================

// 5.1. Инициатива
$('roll-init-btn')?.addEventListener('click', async () => {
    try {
        const chars = state.battleData?.characters || {};
        const turnOrder = [];
        for (const [id, char] of Object.entries(chars)) {
            if (!char.isActive) continue;
            const agBonus = Math.floor((char.ag || 25) / 10);
            const roll = Math.floor(Math.random() * 10) + 1;
            turnOrder.push({ id, initiative: roll + agBonus, name: char.name || 'Безымянный' });
        }
        turnOrder.sort((a, b) => b.initiative - a.initiative);

        await updateDoc(battleRef, {
            turnOrder: turnOrder,
            currentTurnIndex: 0,
            currentPlayerId: turnOrder.length > 0 ? turnOrder[0].id : null,
            turn: (state.battleData?.turn || 0) + 1
        });

        addLogEntry(`🎲 Инициатива: ${turnOrder.map((t, i) => `${i + 1}. ${t.name} (${t.initiative})`).join(' → ')}`, 'system');
    } catch (err) {
        console.error(err);
        addLogEntry(`❌ Ошибка инициативы: ${err.message}`, 'system');
    }
});

// 5.2. Следующий ход
$('next-turn-btn')?.addEventListener('click', async () => {
    try {
        const data = state.battleData;
        if (!data) return;
        const turnOrder = data.turnOrder || [];
        if (turnOrder.length === 0) return;

        let nextIndex = (data.currentTurnIndex || 0) + 1;
        let attempts = 0;
        const maxAttempts = turnOrder.length * 2;

        while (attempts < maxAttempts) {
            if (nextIndex >= turnOrder.length) nextIndex = 0;
            const nextId = turnOrder[nextIndex]?.id;
            if (nextId && data.characters[nextId]?.isActive !== false) break;
            nextIndex++;
            attempts++;
        }

        if (attempts >= maxAttempts) {
            await updateDoc(battleRef, { isFinished: true, isActive: false });
            addLogEntry('⚔️ БОЙ ЗАВЕРШЁН (все мертвы)', 'system');
            return;
        }

        await updateDoc(battleRef, {
            currentTurnIndex: nextIndex,
            currentPlayerId: turnOrder[nextIndex].id,
            turn: (data.turn || 0) + 1
        });
    } catch (err) {
        console.error(err);
        addLogEntry(`❌ Ошибка перехода хода: ${err.message}`, 'system');
    }
});

// 5.3. Добавить NPC
$('add-npc-btn')?.addEventListener('click', async () => {
    const template = prompt('Выберите шаблон NPC (cultist, beastman, albino, flamingPredator, gregor):', 'beastman');
    if (!template || !NPC_TEMPLATES[template]) {
        alert('Неверный шаблон. Доступны: cultist, beastman, albino, flamingPredator, gregor');
        return;
    }
    const npc = { ...NPC_TEMPLATES[template] };
    const name = prompt('Имя NPC (оставьте пустым для шаблонного):', npc.name);
    if (name && name.trim()) npc.name = name.trim();

    try {
        const charId = `char_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const charData = {
            ...npc,
            id: charId,
            wounds: npc.maxWounds || npc.wounds || 10,
            maxWounds: npc.maxWounds || npc.wounds || 10,
            conditions: [],
            isActive: true,
            playerName: 'GM',
            joinedAt: serverTimestamp()
        };
        await updateDoc(battleRef, {
            [`characters.${charId}`]: charData,
            turnOrder: arrayUnion({ id: charId, initiative: 0, name: charData.name || 'Безымянный' })
        });
        addLogEntry(`👹 Призван ${npc.name}`, 'system');
    } catch (err) {
        console.error(err);
        alert('Ошибка добавления NPC: ' + err.message);
    }
});

// 5.4. Добавить игрока
$('add-player-btn')?.addEventListener('click', async () => {
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
        const charId = `char_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await updateDoc(battleRef, {
            [`characters.${charId}`]: {
                ...char,
                id: charId,
                wounds: char.maxWounds || char.wounds || 10,
                maxWounds: char.maxWounds || char.wounds || 10,
                conditions: [],
                isActive: true,
                playerName: playerName,
                joinedAt: serverTimestamp()
            },
            turnOrder: arrayUnion({ id: charId, initiative: 0, name: char.name || 'Безымянный' })
        });
        addLogEntry(`👤 ${name} (${playerName}) вступил в бой`, 'system');
    } catch (err) {
        console.error(err);
        alert('Ошибка добавления игрока: ' + err.message);
    }
});

// 5.5. Атака
$('attack-btn')?.addEventListener('click', async () => {
    const attackerId = $('attacker-select')?.value;
    const defenderId = $('defender-select')?.value;
    const weapon = $('weapon-select')?.value || 'Кулак';
    const modifier = parseInt($('modifier-input')?.value) || 0;
    const isFull = $('full-attack-check')?.checked || false;
    const isAllOut = $('all-out-check')?.checked || false;

    if (!attackerId || !defenderId) {
        alert('Выберите атакующего и цель');
        return;
    }
    if (attackerId === defenderId) {
        alert('Нельзя атаковать самого себя');
        return;
    }

    try {
        const data = state.battleData;
        if (!data) return;
        const attacker = data.characters[attackerId];
        const defender = data.characters[defenderId];
        if (!attacker || !defender) throw new Error('Персонаж не найден');
        if (!attacker.isActive || !defender.isActive) throw new Error('Персонаж не активен');

        // Бросок атаки
        const baseStat = attacker.ws || 25;
        const target = baseStat + modifier + (isFull ? 10 : 0) + (isAllOut ? 30 : 0);
        const roll = Math.floor(Math.random() * 100) + 1;
        const isSuccess = roll <= target;
        const degrees = isSuccess ? Math.floor((target - roll) / 10) + 1 : Math.floor((roll - target) / 10) + 1;
        const hitLocation = ['head', 'rightArm', 'leftArm', 'body', 'rightLeg', 'leftLeg'][Math.floor(Math.random() * 6)];

        // Урон
        const weaponDmg = { 'Кулак': 3, 'Когти': 6, 'Мясницкий тесак': 8, 'Ритуальный нож': 4, 'Огненные когти': 14, 'Автопистолет': 5 }[weapon] || 4;
        const strBonus = Math.floor((attacker.s || 25) / 10) * 2;
        let baseDamage = weaponDmg + strBonus;
        if (isSuccess) baseDamage += Math.floor((degrees - 1) / 2);
        const armor = defender.armor || { head: 0, body: 0, arms: 0, legs: 0 };
        const armorValue = armor[hitLocation] || 0;
        const pen = { 'Кулак': 0, 'Когти': 2, 'Мясницкий тесак': 2, 'Ритуальный нож': 1, 'Огненные когти': 4, 'Автопистолет': 2 }[weapon] || 1;
        const finalDamage = Math.max(0, baseDamage - Math.max(0, armorValue - pen));
        const isCritical = finalDamage > 0 && Math.floor(Math.random() * 10) + 1 === 10;

        // Применяем урон
        if (isSuccess && finalDamage > 0) {
            const newWounds = defender.wounds - finalDamage;
            const isDead = newWounds <= -defender.maxWounds;
            await updateDoc(battleRef, {
                [`characters.${defenderId}.wounds`]: newWounds,
                [`characters.${defenderId}.status`]: isDead ? 'dead' : (newWounds <= 0 ? 'critical' : 'alive'),
                [`characters.${defenderId}.isActive`]: !isDead
            });
            if (isDead) {
                const kills = (data.kills || 0) + 1;
                await updateDoc(battleRef, { kills: kills });
                killCounter.textContent = kills;
            }
        }

        // Лог
        const logText = isSuccess
            ? `${attacker.name} → ${defender.name}: ${isSuccess ? 'ПОПАДАНИЕ' : 'ПРОМАХ'} (${roll}/${target}) ${finalDamage > 0 ? `Урон: ${finalDamage}` : ''} ${isCritical ? '🔥 КРИТ!' : ''}`
            : `${attacker.name} промахивается по ${defender.name} (${roll}/${target})`;
        addLogEntry(logText, isSuccess ? (finalDamage > 0 ? 'damage' : 'system') : 'system');

        // Отображаем результат
        attackResult.style.display = 'block';
        attackResult.innerHTML = `
            <div><strong>${attacker.name}</strong> → <strong>${defender.name}</strong></div>
            <div>Бросок: ${roll} (Цель: ${target}) ${isSuccess ? '✅' : '❌'}</div>
            <div>Успехов: ${isSuccess ? '+' : ''}${degrees}</div>
            <div>Место: ${hitLocation}</div>
            <div>Урон: ${finalDamage} (база ${baseDamage}, броня ${armorValue}, пенетрация ${pen})</div>
            ${isCritical ? '<div style="color:#ff8800; font-weight:bold;">🔥 КРИТИЧЕСКОЕ ПОПАДАНИЕ!</div>' : ''}
        `;
    } catch (err) {
        console.error(err);
        alert('Ошибка атаки: ' + err.message);
    }
});

// 5.6. Кубы
const diceRoll = (sides) => {
    const result = Math.floor(Math.random() * sides) + 1;
    addLogEntry(`🎲 d${sides}: <span class="dice-roll">${result}</span>`, 'system');
};

$('dice-d100')?.addEventListener('click', () => diceRoll(100));
$('dice-d10')?.addEventListener('click', () => diceRoll(10));
$('dice-d5')?.addEventListener('click', () => diceRoll(5));
$('dice-custom')?.addEventListener('click', () => {
    const sides = parseInt($('dice-custom-input')?.value) || 20;
    diceRoll(sides);
});

// 5.7. Заметки
$('save-notes-btn')?.addEventListener('click', () => {
    const notes = $('gm-notes')?.value || '';
    localStorage.setItem(`battle_${state.battleId}_notes`, notes);
    addLogEntry('📝 Заметки сохранены', 'system');
});

// Восстановить заметки при загрузке
const savedNotes = localStorage.getItem(`battle_${state.battleId}_notes`);
if (savedNotes && $('gm-notes')) {
    $('gm-notes').value = savedNotes;
}

// ============================================================
// 6. ОЧИСТКА ПРИ УХОДЕ
// ============================================================
window.addEventListener('beforeunload', () => {
    if (state.unsubscribe) state.unsubscribe();
    // ============================================================
    // 7. АКТИВАЦИЯ КНОПОК
    // ============================================================
    document.addEventListener('DOMContentLoaded', () => {
        // Проверяем, что элементы существуют
        const rollInitBtn = document.getElementById('roll-init-btn');
        const nextTurnBtn = document.getElementById('next-turn-btn');
        const addNpcBtn = document.getElementById('add-npc-btn');
        const addPlayerBtn = document.getElementById('add-player-btn');
        const attackBtn = document.getElementById('attack-btn');
        const diceD100 = document.getElementById('dice-d100');
        const diceD10 = document.getElementById('dice-d10');
        const diceD5 = document.getElementById('dice-d5');
        const diceCustom = document.getElementById('dice-custom');
        const saveNotesBtn = document.getElementById('save-notes-btn');

        // Временные заглушки — чтобы кнопки реагировали
        if (rollInitBtn) {
            rollInitBtn.addEventListener('click', () => {
                console.log('🎲 Инициатива нажата');
                alert('Инициатива будет работать после полной настройки');
            });
        }

        if (nextTurnBtn) {
            nextTurnBtn.addEventListener('click', () => {
                console.log('⏩ Следующий ход нажат');
                alert('Переход хода будет работать после полной настройки');
            });
        }

        if (addNpcBtn) {
            addNpcBtn.addEventListener('click', () => {
                console.log('👹 Добавить NPC нажата');
                const name = prompt('Введите имя NPC:', 'Культист');
                if (name) {
                    alert(`NPC ${name} добавлен (временная заглушка)`);
                }
            });
        }

        if (addPlayerBtn) {
            addPlayerBtn.addEventListener('click', () => {
                console.log('👤 Добавить игрока нажата');
                const name = prompt('Введите имя игрока:', 'Воин Хаоса');
                if (name) {
                    alert(`Игрок ${name} добавлен (временная заглушка)`);
                }
            });
        }

        if (attackBtn) {
            attackBtn.addEventListener('click', () => {
                console.log('💥 Атака нажата');
                const attacker = document.getElementById('attacker-select')?.value || 'Атакующий';
                const defender = document.getElementById('defender-select')?.value || 'Цель';
                alert(`⚔️ ${attacker} атакует ${defender} (временная заглушка)`);
            });
        }

        if (diceD100) {
            diceD100.addEventListener('click', () => {
                const result = Math.floor(Math.random() * 100) + 1;
                alert(`🎲 d100: ${result}`);
            });
        }

        if (diceD10) {
            diceD10.addEventListener('click', () => {
                const result = Math.floor(Math.random() * 10) + 1;
                alert(`🎲 d10: ${result}`);
            });
        }

        if (diceD5) {
            diceD5.addEventListener('click', () => {
                const result = Math.floor(Math.random() * 5) + 1;
                alert(`🎲 d5: ${result}`);
            });
        }

        if (diceCustom) {
            diceCustom.addEventListener('click', () => {
                const sides = parseInt(document.getElementById('dice-custom-input')?.value) || 20;
                const result = Math.floor(Math.random() * sides) + 1;
                alert(`🎲 d${sides}: ${result}`);
            });
        }

        if (saveNotesBtn) {
            saveNotesBtn.addEventListener('click', () => {
                const notes = document.getElementById('gm-notes')?.value || '';
                localStorage.setItem(`battle_${state.battleId}_notes`, notes);
                alert('📝 Заметки сохранены!');
            });
        }

        console.log('✅ Все кнопки активированы (временные заглушки)');
    });
});

console.log('🔥 Боевая комната загружена! ID:', state.battleId);