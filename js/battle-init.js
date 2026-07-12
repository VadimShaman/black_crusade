// js/battle-init.js
// ============================================================
// БОЕВАЯ КОМНАТА — ПОЛНАЯ ЛОГИКА
// Подключение к Firebase, управление участниками, инициатива,
// атака, кубы, заметки, экспорт/импорт лога.
// ============================================================

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

// Получаем ID боя из URL
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

/**
 * Добавляет запись в лог боя (локально, без Firebase)
 */
function addLogEntry(text, type = 'system') {
    if (!logContainer) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="time">[${time}]</span> ${text}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * Обновляет список участников, селекты для атаки и кнопки редактирования
 */
function updateCombatants(data) {
    if (!combatantsList) return;
    const chars = data.characters || {};
    const turnOrder = data.turnOrder || [];
    const entries = Object.entries(chars);

    totalCombatants.textContent = entries.length;
    activeCombatants.textContent = entries.filter(([_, c]) => c.isActive !== false).length;

    // ===== ОБНОВЛЯЕМ СЕЛЕКТЫ ДЛЯ АТАКИ =====
    const attackerSelect = document.getElementById('attacker-select');
    const defenderSelect = document.getElementById('defender-select');
    if (attackerSelect) {
        attackerSelect.innerHTML = '<option value="">Атакующий</option>';
        entries.forEach(([id, char]) => {
            if (char.isActive !== false && char.status !== 'dead') {
                attackerSelect.innerHTML += `<option value="${id}">${char.name} (${char.role || 'NPC'})</option>`;
            }
        });
    }
    if (defenderSelect) {
        defenderSelect.innerHTML = '<option value="">Цель</option>';
        entries.forEach(([id, char]) => {
            if (char.isActive !== false && char.status !== 'dead') {
                defenderSelect.innerHTML += `<option value="${id}">${char.name} (${char.role || 'NPC'})</option>`;
            }
        });
    }

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
                    <span style="color:#887777; font-size:11px; margin-left:6px;">[${char.role || 'NPC'}]</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:13px; ${hpPercent < 25 ? 'color:#cc4444;' : ''}">
                        ${isDead ? '💀' : `${char.wounds}/${char.maxWounds}`}
                    </span>
                    <span class="status-badge ${char.status || 'alive'}">${char.status || 'alive'}</span>
                    <button class="tab-btn edit-char-btn" data-id="${id}" style="padding:2px 8px; font-size:11px; background:#1a2a3a;">✏️</button>
                </div>
            </div>
        `;
    }
    combatantsList.innerHTML = html;

    // ===== ОБРАБОТЧИКИ ДЛЯ РЕДАКТИРОВАНИЯ =====
    document.querySelectorAll('.edit-char-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const charId = btn.dataset.id;
            const char = data.characters[charId];
            if (!char) return;
            openEditForm(charId, char);
        });
    });
}

// ============================================================
// 4. ПОДПИСКА НА БОЙ (FIREBASE REALTIME)
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

    // Отображаем лог из Firebase
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
// 5. ДОБАВЛЕНИЕ ПЕРСОНАЖА
// ============================================================

/**
 * Добавляет персонажа в Firebase
 */
async function addCharacterToBattle(charData) {
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
        addLogEntry(`👤 ${charData.name} (${charData.role}) добавлен в бой`, 'system');
    } catch (err) {
        console.error(err);
        alert('Ошибка добавления: ' + err.message);
    }
}

/**
 * Упрощённое добавление персонажа через prompt
 */
function addSimpleCharacter(role, isNPC = true) {
    const name = prompt(`Имя ${role}:`, role === 'Игрок' ? 'Воин Хаоса' : `${role}`);
    if (!name) return;
    const playerName = isNPC ? 'GM' : (prompt('Имя игрока:', 'Игрок') || 'Игрок');

    const charData = {
        name: name,
        ws: 30, bs: 30, s: 30, t: 30, ag: 30, int: 30, per: 30, wp: 30, fel: 30,
        wounds: 12, maxWounds: 12,
        armor: { head: 0, body: 2, arms: 0, legs: 0 },
        weapon: 'Кулак',
        traits: [],
        status: 'alive',
        isNPC: isNPC,
        role: role,
        playerName: playerName,
        ally: role === 'Союзник',
        enemy: role === 'Враг'
    };

    addCharacterToBattle(charData);
}

// ============================================================
// 5.5. РЕДАКТИРОВАНИЕ ПЕРСОНАЖА
// ============================================================

/**
 * Открывает модальное окно для редактирования статов персонажа
 */
function openEditForm(charId, charData) {
    const modal = document.createElement('div');
    modal.id = 'edit-char-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center;
        z-index: 1000; padding: 20px;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px;
                    padding: 24px; max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto;">
            <h2 style="color: var(--accent-glow); margin-top: 0;">✏️ Редактирование: ${charData.name}</h2>
            
            <div style="margin-bottom: 12px;">
                <label style="color: #887777; display: block; font-size: 13px;">Имя</label>
                <input type="text" id="edit-char-name" value="${charData.name || ''}"
                       style="width: 100%; padding: 8px; background: #0a0808; border: 1px solid var(--border-color);
                              color: var(--text-light); border-radius: 4px;">
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">WS</label>
                    <input type="number" id="edit-ws" value="${charData.ws || 30}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">BS</label>
                    <input type="number" id="edit-bs" value="${charData.bs || 30}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">S</label>
                    <input type="number" id="edit-s" value="${charData.s || 30}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">T</label>
                    <input type="number" id="edit-t" value="${charData.t || 30}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">Ag</label>
                    <input type="number" id="edit-ag" value="${charData.ag || 30}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">WP</label>
                    <input type="number" id="edit-wp" value="${charData.wp || 30}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">❤️ Раны (max)</label>
                    <input type="number" id="edit-wounds" value="${charData.maxWounds || 12}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">🛡️ Броня (тело)</label>
                    <input type="number" id="edit-armor" value="${charData.armor?.body || 0}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 16px;">
                <button id="edit-submit-btn" style="flex: 1; padding: 10px; background: var(--primary-red); border: none;
                        color: #fff; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    💾 Сохранить
                </button>
                <button id="edit-cancel-btn" style="flex: 1; padding: 10px; background: #2a2a3e; border: none;
                        color: var(--text-light); border-radius: 4px; cursor: pointer;">
                    ❌ Отмена
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#edit-cancel-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('#edit-submit-btn').addEventListener('click', async () => {
        const updatedData = {
            name: modal.querySelector('#edit-char-name').value.trim() || charData.name,
            ws: parseInt(modal.querySelector('#edit-ws').value) || 30,
            bs: parseInt(modal.querySelector('#edit-bs').value) || 30,
            s: parseInt(modal.querySelector('#edit-s').value) || 30,
            t: parseInt(modal.querySelector('#edit-t').value) || 30,
            ag: parseInt(modal.querySelector('#edit-ag').value) || 30,
            wp: parseInt(modal.querySelector('#edit-wp').value) || 30,
            maxWounds: parseInt(modal.querySelector('#edit-wounds').value) || 12,
            armor: {
                ...charData.armor,
                body: parseInt(modal.querySelector('#edit-armor').value) || 0
            }
        };

        try {
            await updateDoc(battleRef, {
                [`characters.${charId}.name`]: updatedData.name,
                [`characters.${charId}.ws`]: updatedData.ws,
                [`characters.${charId}.bs`]: updatedData.bs,
                [`characters.${charId}.s`]: updatedData.s,
                [`characters.${charId}.t`]: updatedData.t,
                [`characters.${charId}.ag`]: updatedData.ag,
                [`characters.${charId}.wp`]: updatedData.wp,
                [`characters.${charId}.maxWounds`]: updatedData.maxWounds,
                [`characters.${charId}.armor.body`]: updatedData.armor.body
            });
            addLogEntry(`✏️ ${updatedData.name} обновлён`, 'system');
            modal.remove();
        } catch (err) {
            console.error(err);
            alert('Ошибка обновления: ' + err.message);
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// 6. ОБРАБОТЧИКИ ДОБАВЛЕНИЯ ПЕРСОНАЖЕЙ
// ============================================================
document.getElementById('add-player-btn')?.addEventListener('click', () => addSimpleCharacter('Игрок', false));
document.getElementById('add-ally-btn')?.addEventListener('click', () => addSimpleCharacter('Союзник', true));
document.getElementById('add-enemy-btn')?.addEventListener('click', () => addSimpleCharacter('Враг', true));

// Добавление NPC по шаблону
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
            role: 'NPC',
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
// 7. ИНИЦИАТИВА
// ============================================================
document.getElementById('roll-init-btn')?.addEventListener('click', async () => {
    console.log('🎲 Инициатива нажата');
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

// ============================================================
// 8. СЛЕДУЮЩИЙ ХОД
// ============================================================
document.getElementById('next-turn-btn')?.addEventListener('click', async () => {
    console.log('⏩ Следующий ход нажат');
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

// ============================================================
// 9. АТАКА
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
        if (!data) throw new Error('Данные боя не загружены');
        const attacker = data.characters[attackerId];
        const defender = data.characters[defenderId];
        if (!attacker || !defender) throw new Error('Персонаж не найден');
        if (!attacker.isActive || !defender.isActive) throw new Error('Персонаж не активен');

        const target = threshold + modifier + (isFull ? 10 : 0) + (isAllOut ? 30 : 0);
        const roll = Math.floor(Math.random() * 100) + 1;
        const isSuccess = roll <= target;
        const degrees = isSuccess ? Math.floor((target - roll) / 10) + 1 : Math.floor((roll - target) / 10) + 1;
        const hitLocation = ['Голова', 'Правая рука', 'Левая рука', 'Торс', 'Правая нога', 'Левая нога'][Math.floor(Math.random() * 6)];

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
                    finalDamage = total + mod + Math.floor((degrees - 1) / 2);
                    if (finalDamage < 0) finalDamage = 0;
                } else {
                    finalDamage = parseInt(damageDice) || 0;
                }
            } catch (e) {
                finalDamage = 0;
            }

            const armor = defender.armor || { head: 0, body: 0, arms: 0, legs: 0 };
            const armorValue = armor[hitLocation.toLowerCase()] || 0;
            finalDamage = Math.max(0, finalDamage - armorValue);
        }

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

        const successText = isSuccess ? '✅ ПОПАДАНИЕ' : '❌ ПРОМАХ';
        const damageText = isSuccess && finalDamage > 0
            ? `💥 Урон: ${finalDamage} [${damageRolls.join(', ')}]`
            : (isSuccess ? '🛡️ Урон поглощён броней' : '');
        addLogEntry(`${attacker.name} → ${defender.name}: ${successText} (${roll}/${target}) ${damageText}`, isSuccess ? 'damage' : 'system');

        if (attackResult) {
            attackResult.style.display = 'block';
            attackResult.innerHTML = `
                <div><strong>${attacker.name}</strong> → <strong>${defender.name}</strong></div>
                <div>⚔️ ${weaponName}</div>
                <div>🎯 Бросок: ${roll} (Цель: ${target}) ${isSuccess ? '✅' : '❌'}</div>
                <div>📊 Успехов: ${isSuccess ? '+' : ''}${degrees}</div>
                <div>🎯 Место: ${hitLocation}</div>
                <div>🎲 Кубы: ${damageDice} → ${isSuccess ? finalDamage : 'промах'}</div>
                ${damageRolls.length > 0 ? `<div>🎲 Броски: [${damageRolls.join(', ')}]</div>` : ''}
                ${isSuccess && finalDamage > 0 ? `<div style="color:#cc4444; font-weight:bold;">💥 Урон: ${finalDamage}</div>` : ''}
                ${isSuccess && finalDamage === 0 ? '<div style="color:#887777;">🛡️ Урон поглощён броней</div>' : ''}
                ${!isSuccess ? '<div style="color:#887777;">❌ Промах</div>' : ''}
            `;
        }
    } catch (err) {
        console.error(err);
        alert('Ошибка атаки: ' + err.message);
    }
});

// ============================================================
// 10. КУБЫ
// ============================================================

// Обычные кнопки кубов (d4, d6, d8, d10, d12, d20, d100)
document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const sides = parseInt(btn.dataset.sides);
        const result = Math.floor(Math.random() * sides) + 1;
        addLogEntry(`🎲 d${sides}: <span class="dice-roll">${result}</span>`, 'system');
    });
});

// Пользовательский ввод (3d6, 2d10+5 и т.д.)
document.getElementById('dice-custom-btn')?.addEventListener('click', () => {
    const input = document.getElementById('dice-custom-input');
    const expr = input.value.trim();
    if (!expr) return;

    try {
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
// 11. ЗАМЕТКИ GM (LOCALSTORAGE)
// ============================================================
document.getElementById('save-notes-btn')?.addEventListener('click', () => {
    const notes = document.getElementById('gm-notes')?.value || '';
    localStorage.setItem(`battle_${state.battleId}_notes`, notes);
    addLogEntry('📝 Заметки сохранены', 'system');
});

// Восстанавливаем заметки при загрузке
const savedNotes = localStorage.getItem(`battle_${state.battleId}_notes`);
if (savedNotes && document.getElementById('gm-notes')) {
    document.getElementById('gm-notes').value = savedNotes;
}

// ============================================================
// 12. ЭКСПОРТ / ИМПОРТ ЛОГА
// ============================================================

// Экспорт лога в JSON
document.getElementById('export-log-btn')?.addEventListener('click', async () => {
    try {
        const battleSnap = await getDoc(battleRef);
        if (!battleSnap.exists()) throw new Error('Бой не найден');
        const data = battleSnap.data();
        const log = data.log || [];
        if (log.length === 0) {
            alert('Нет записей в логе для экспорта');
            return;
        }
        const json = JSON.stringify(log, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `battle_log_${state.battleId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Ошибка экспорта: ' + err.message);
    }
});

// Импорт лога из JSON
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
        for (const entry of log) {
            addLogEntry(entry.text || JSON.stringify(entry), entry.isSystem ? 'system' : '');
        }
        alert(`Импортировано ${log.length} записей`);
    } catch (err) {
        alert('Ошибка импорта: ' + err.message);
    }
    e.target.value = '';
});

// ============================================================
// 13. ОЧИСТКА ПРИ УХОДЕ
// ============================================================
window.addEventListener('beforeunload', () => {
    if (state.unsubscribe) state.unsubscribe();
});

console.log('🔥 Боевая комната загружена! ID:', state.battleId);