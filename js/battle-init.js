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
    if (!logContainer) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="time">[${time}]</span> ${text}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function updateCombatants(data) {
    if (!combatantsList) return;
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
    if (battleTitle) battleTitle.textContent = `⚔️ ${data.name || 'Сражение'}`;
    if (battleIdDisplay) battleIdDisplay.textContent = `ID: ${state.battleId}`;
    if (turnDisplay) turnDisplay.textContent = data.turn || 0;
    if (currentTurnDisplay) currentTurnDisplay.textContent = data.turnOrder?.[data.currentTurnIndex]?.name || '—';
    if (killCounter) killCounter.textContent = data.kills || 0;

    updateCombatants(data);

    // Лог
    if (data.log && data.log.length > 0 && logContainer) {
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
    if (logContainer) logContainer.innerHTML = '<div style="color:#cc4444;">❌ Ошибка подключения к Firebase</div>';
});

// ============================================================
// 5. ДОБАВЛЕНИЕ ПЕРСОНАЖА (С ПОЛНЫМИ СТАТАМИ)
// ============================================================

// Функция для открытия формы добавления персонажа
function openCharacterForm(role = 'Игрок', isNPC = false) {
    // Создаём модальное окно
    const modal = document.createElement('div');
    modal.id = 'char-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center;
        z-index: 1000; padding: 20px;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; 
                    padding: 24px; max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto;">
            <h2 style="color: var(--accent-glow); margin-top: 0;">👤 Добавление: ${role}</h2>
            
            <div style="margin-bottom: 12px;">
                <label style="color: #887777; display: block; font-size: 13px;">Имя персонажа</label>
                <input type="text" id="form-char-name" value="${role === 'Игрок' ? 'Воин Хаоса' : role}" 
                       style="width: 100%; padding: 8px; background: #0a0808; border: 1px solid var(--border-color); 
                              color: var(--text-light); border-radius: 4px;">
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">WS</label>
                    <input type="number" id="form-ws" value="30" style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">BS</label>
                    <input type="number" id="form-bs" value="30" style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">S</label>
                    <input type="number" id="form-s" value="30" style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">T</label>
                    <input type="number" id="form-t" value="30" style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">Ag</label>
                    <input type="number" id="form-ag" value="30" style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">WP</label>
                    <input type="number" id="form-wp" value="30" style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;">
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">❤️ Раны (max)</label>
                    <input type="number" id="form-wounds" value="12" style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">🛡️ Броня (тело)</label>
                    <input type="number" id="form-armor" value="2" style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;">
                </div>
            </div>
            
            ${!isNPC ? `
            <div style="margin-bottom: 12px;">
                <label style="color: #887777; display: block; font-size: 13px;">Имя игрока</label>
                <input type="text" id="form-player-name" value="Игрок" 
                       style="width: 100%; padding: 8px; background: #0a0808; border: 1px solid var(--border-color); 
                              color: var(--text-light); border-radius: 4px;">
            </div>
            ` : ''}
            
            <div style="display: flex; gap: 10px; margin-top: 16px;">
                <button id="form-submit-btn" style="flex: 1; padding: 10px; background: var(--primary-red); border: none; 
                        color: #fff; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    ✅ Добавить
                </button>
                <button id="form-cancel-btn" style="flex: 1; padding: 10px; background: #2a2a3e; border: none; 
                        color: var(--text-light); border-radius: 4px; cursor: pointer;">
                    ❌ Отмена
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Обработчики
    modal.querySelector('#form-cancel-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('#form-submit-btn').addEventListener('click', async () => {
        const name = modal.querySelector('#form-char-name').value.trim() || 'Безымянный';
        const playerName = modal.querySelector('#form-player-name')?.value.trim() || 'GM';

        const charData = {
            name: name,
            ws: parseInt(modal.querySelector('#form-ws').value) || 30,
            bs: parseInt(modal.querySelector('#form-bs').value) || 30,
            s: parseInt(modal.querySelector('#form-s').value) || 30,
            t: parseInt(modal.querySelector('#form-t').value) || 30,
            ag: parseInt(modal.querySelector('#form-ag').value) || 30,
            wp: parseInt(modal.querySelector('#form-wp').value) || 30,
            int: 30, per: 30, fel: 30,
            wounds: parseInt(modal.querySelector('#form-wounds').value) || 12,
            maxWounds: parseInt(modal.querySelector('#form-wounds').value) || 12,
            armor: {
                head: 0,
                body: parseInt(modal.querySelector('#form-armor').value) || 0,
                arms: 0,
                legs: 0
            },
            weapon: 'Кулак',
            traits: [],
            status: 'alive',
            isNPC: isNPC,
            role: role,
            playerName: isNPC ? 'GM' : playerName
        };

        try {
            const charId = `char_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            await updateDoc(battleRef, {
                [`characters.${charId}`]: {
                    ...charData,
                    id: charId,
                    conditions: [],
                    isActive: true,
                    joinedAt: serverTimestamp()
                },
                turnOrder: arrayUnion({ id: charId, initiative: 0, name: charData.name || 'Безымянный' })
            });
            addLogEntry(`👤 ${name} (${charData.role}) добавлен в бой`, 'system');
            modal.remove();
        } catch (err) {
            console.error(err);
            alert('Ошибка добавления: ' + err.message);
        }
    });

    // Закрытие по клику вне окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// 6. ОБРАБОТЧИКИ КНОПОК ДОБАВЛЕНИЯ
// ============================================================
document.getElementById('add-player-btn')?.addEventListener('click', () => openCharacterForm('Игрок', false));
document.getElementById('add-ally-btn')?.addEventListener('click', () => openCharacterForm('Союзник', true));
document.getElementById('add-enemy-btn')?.addEventListener('click', () => openCharacterForm('Враг', true));

// NPC (шаблон) — оставляем старый быстрый способ
document.getElementById('add-npc-btn')?.addEventListener('click', async () => {
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
// ============================================================
// 5.5. АТАКА (НОВАЯ ВЕРСИЯ)
// ============================================================
document.getElementById('attack-btn')?.addEventListener('click', async () => {
    console.log('💥 Атака нажата');
    const attackerId = document.getElementById('attacker-select')?.value;
    const defenderId = document.getElementById('defender-select')?.value;
    const weaponName = document.getElementById('weapon-name-input')?.value || 'Кулак';
    const threshold = parseInt(document.getElementById('attack-threshold-input')?.value) || 45;
    const damageDice = document.getElementById('damage-dice-input')?.value || '1d10';
    const modifier = parseInt(document.getElementById('modifier-input')?.value) || 0;
    const isFull = document.getElementById('full-attack-check')?.checked || false;
    const isAllOut = document.getElementById('all-out-check')?.checked || false;

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
        const target = threshold + modifier + (isFull ? 10 : 0) + (isAllOut ? 30 : 0);
        const roll = Math.floor(Math.random() * 100) + 1;
        const isSuccess = roll <= target;
        const degrees = isSuccess ? Math.floor((target - roll) / 10) + 1 : Math.floor((roll - target) / 10) + 1;
        const hitLocation = ['head', 'rightArm', 'leftArm', 'body', 'rightLeg', 'leftLeg'][Math.floor(Math.random() * 6)];

        // Парсим кубы урона (поддерживает 1d10, 2d6+4, 3d8-2)
        let finalDamage = 0;
        let damageRolls = [];
        if (isSuccess) {
            try {
                const match = damageDice.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
                if (match) {
                    const count = parseInt(match[1]) || 1;
                    const sides = parseInt(match[2]);
                    const mod = parseInt(match[3] || '0');
                    let total = 0;
                    for (let i = 0; i < count; i++) {
                        const r = Math.floor(Math.random() * sides) + 1;
                        damageRolls.push(r);
                        total += r;
                    }
                    finalDamage = total + mod + Math.floor((degrees - 1) / 2); // + бонус от успехов
                    if (finalDamage < 0) finalDamage = 0;
                } else {
                    // Если не распарсили — пробуем как простое число
                    finalDamage = parseInt(damageDice) || 0;
                }
            } catch (e) {
                finalDamage = 0;
            }
        }

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
                if (killCounter) killCounter.textContent = kills;
            }
        }

        // Лог с деталями
        const successText = isSuccess ? '✅ ПОПАДАНИЕ' : '❌ ПРОМАХ';
        const damageText = isSuccess && finalDamage > 0
            ? `Урон: ${finalDamage} [${damageRolls.join(', ')}]`
            : (isSuccess ? 'Урон: 0 (поглощён)' : '');
        const logText = `${attacker.name} → ${defender.name}: ${successText} (${roll}/${target}) ${damageText}`;
        addLogEntry(logText, isSuccess ? 'damage' : 'system');

        // Отображаем результат
        if (attackResult) {
            attackResult.style.display = 'block';
            attackResult.innerHTML = `
                <div><strong>${attacker.name}</strong> → <strong>${defender.name}</strong></div>
                <div>Оружие: <strong>${weaponName}</strong></div>
                <div>Бросок: ${roll} (Цель: ${target}) ${isSuccess ? '✅' : '❌'}</div>
                <div>Успехов: ${isSuccess ? '+' : ''}${degrees}</div>
                <div>Место попадания: ${hitLocation}</div>
                <div>Кубы урона: ${damageDice} → ${isSuccess ? finalDamage : 'промах'}</div>
                ${damageRolls.length > 0 ? `<div>Броски: [${damageRolls.join(', ')}]</div>` : ''}
                ${isSuccess && finalDamage > 0 ? `<div style="color:#cc4444; font-weight:bold;">💥 Урон: ${finalDamage}</div>` : ''}
                ${isSuccess && finalDamage === 0 ? '<div style="color:#887777;">Урон поглощён броней</div>' : ''}
            `;
        }
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

document.getElementById('dice-d100')?.addEventListener('click', () => diceRoll(100));
document.getElementById('dice-d10')?.addEventListener('click', () => diceRoll(10));
document.getElementById('dice-d5')?.addEventListener('click', () => diceRoll(5));
document.getElementById('dice-custom')?.addEventListener('click', () => {
    const sides = parseInt(document.getElementById('dice-custom-input')?.value) || 20;
    diceRoll(sides);
});

// 5.7. Заметки
document.getElementById('save-notes-btn')?.addEventListener('click', () => {
    const notes = document.getElementById('gm-notes')?.value || '';
    localStorage.setItem(`battle_${state.battleId}_notes`, notes);
    addLogEntry('📝 Заметки сохранены', 'system');
});

// Восстановить заметки при загрузке
const savedNotes = localStorage.getItem(`battle_${state.battleId}_notes`);
if (savedNotes && document.getElementById('gm-notes')) {
    document.getElementById('gm-notes').value = savedNotes;
}
// ============================================================
// 7. КУБЫ (НОВАЯ ВЕРСИЯ)
// ============================================================
document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const sides = parseInt(btn.dataset.sides);
        const result = Math.floor(Math.random() * sides) + 1;
        addLogEntry(`🎲 d${sides}: <span class="dice-roll">${result}</span>`, 'system');
    });
});

document.getElementById('dice-custom-btn')?.addEventListener('click', () => {
    const input = document.getElementById('dice-custom-input');
    const expr = input.value.trim();
    if (!expr) return;

    try {
        // Парсим выражение вида "3d6" или "2d10+5"
        const match = expr.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
        if (!match) {
            addLogEntry(`❌ Неверный формат кубов: ${expr}`, 'system');
            return;
        }
        const count = parseInt(match[1]) || 1;
        const sides = parseInt(match[2]);
        const mod = parseInt(match[3] || '0');

        if (count > 100 || sides > 1000) {
            addLogEntry(`❌ Слишком много кубов или граней: ${expr}`, 'system');
            return;
        }

        let results = [];
        let total = 0;
        for (let i = 0; i < count; i++) {
            const r = Math.floor(Math.random() * sides) + 1;
            results.push(r);
            total += r;
        }
        total += mod;
        const modStr = mod > 0 ? `+${mod}` : (mod < 0 ? `${mod}` : '');
        addLogEntry(
            `🎲 ${expr} → [${results.join(', ')}]${modStr} = <span class="dice-roll">${total}</span>`,
            'system'
        );
    } catch (e) {
        addLogEntry(`❌ Ошибка броска: ${e.message}`, 'system');
    }
});

// ============================================================
// 8. КНОПКИ ДОБАВЛЕНИЯ (ИГРОК, СОЮЗНИК, ВРАГ)
// ============================================================
function addCharacterWithRole(role, isNPC = true) {
    const name = prompt(`Имя ${role}:`, role === 'Игрок' ? 'Воин Хаоса' : `${role}`);
    if (!name) return;
    const playerName = isNPC ? 'GM' : (prompt('Имя игрока:', 'Игрок') || 'Игрок');

    const char = {
        name: name,
        ws: 30, bs: 30, s: 30, t: 30, ag: 30, int: 30, per: 30, wp: 30, fel: 30,
        wounds: 12, maxWounds: 12,
        armor: { head: 0, body: 2, arms: 0, legs: 0 },
        weapon: 'Кулак',
        traits: [],
        status: 'alive',
        isNPC: isNPC,
        role: role
    };

    // Союзники и враги — NPC
    if (role === 'Союзник') char.ally = true;
    if (role === 'Враг') char.enemy = true;

    return addCharacterToBattle(char, playerName);
}

document.getElementById('add-ally-btn')?.addEventListener('click', () => addCharacterWithRole('Союзник', true));
document.getElementById('add-enemy-btn')?.addEventListener('click', () => addCharacterWithRole('Враг', true));
// ============================================================
// 9. ИНИЦИАТИВА (НОВАЯ ВЕРСИЯ)
// ============================================================
const initQueue = [];

document.getElementById('init-add-btn')?.addEventListener('click', () => {
    const name = document.getElementById('init-name-input')?.value.trim();
    const bonus = parseInt(document.getElementById('init-bonus-input')?.value) || 0;
    if (!name) return alert('Введите имя');
    const roll = Math.floor(Math.random() * 10) + 1;
    const total = roll + bonus;
    initQueue.push({ name, bonus, roll, total });
    initQueue.sort((a, b) => b.total - a.total);
    renderInitQueue();
    document.getElementById('init-name-input').value = '';
});

function renderInitQueue() {
    const container = document.getElementById('init-queue');
    if (!container) return;
    if (initQueue.length === 0) {
        container.innerHTML = '<span style="color:#554444; font-size:13px;">Очередь пуста</span>';
        return;
    }
    container.innerHTML = initQueue.map((item, index) =>
        `<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span><strong>${item.name}</strong> (бонус ${item.bonus}) → бросок ${item.roll} = <span class="dice-roll">${item.total}</span></span>
            <button class="tab-btn" style="padding:2px 8px; font-size:11px; background:#3a1a1a;" data-index="${index}">✕</button>
        </div>`
    ).join('');
    // Удаление
    container.querySelectorAll('button[data-index]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            initQueue.splice(idx, 1);
            renderInitQueue();
        });
    });
}

document.getElementById('init-roll-all-btn')?.addEventListener('click', () => {
    if (initQueue.length === 0) return alert('Очередь пуста');
    const result = initQueue.map(item => `${item.name} (${item.total})`).join(' → ');
    addLogEntry(`🎲 Инициатива: ${result}`, 'system');
});
// ============================================================
// 10. ЭКСПОРТ/ИМПОРТ ЛОГА
// ============================================================
document.getElementById('export-log-btn')?.addEventListener('click', () => {
    if (!state.battleData?.log) return alert('Нет лога для экспорта');
    const data = JSON.stringify(state.battleData.log, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `battle_log_${state.battleId}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('import-log-btn')?.addEventListener('click', () => {
    document.getElementById('import-log-file')?.click();
});

document.getElementById('import-log-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const log = JSON.parse(text);
        if (!Array.isArray(log)) throw new Error('Не массив');
        // Добавляем каждую запись в лог
        for (const entry of log) {
            await addLogEntry(entry.text || JSON.stringify(entry), entry.isSystem ? 'system' : '');
        }
        alert(`Импортировано ${log.length} записей`);
    } catch (err) {
        alert('Ошибка импорта: ' + err.message);
    }
    e.target.value = '';
});
// ============================================================
// 6. ОЧИСТКА ПРИ УХОДЕ
// ============================================================
window.addEventListener('beforeunload', () => {
    if (state.unsubscribe) state.unsubscribe();
});

console.log('🔥 Боевая комната загружена! ID:', state.battleId);