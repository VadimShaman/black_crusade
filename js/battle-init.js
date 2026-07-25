// js/battle-init.js
// ============================================================
// БОЕВАЯ КОМНАТА — ПОЛНАЯ ЛОГИКА
// ============================================================

import { db } from './firebase-config.js';
import {
    doc, onSnapshot, collection, addDoc, updateDoc,
    deleteDoc, getDoc, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { NPC_TEMPLATES } from './battle/battle-core.js';
import { applyDamage, spendReaction, resetReactions } from './battle/battle-status.js';

// ============================================================
// 1. СОСТОЯНИЕ
// ============================================================
const state = {
    battleId: null,
    battleData: null,
    unsubscribe: null,
    pendingAttack: null, // Хранит данные последней атаки
    defenseResolve: null // Функция для разрешения реакции
};

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
const initOrderDisplay = $('init-order-display');
const defensePanel = $('defense-panel');

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

    // Обновляем селекты
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

    updateInitSelect();
    updateInitOrderDisplay(data);

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
        const od = char.od ?? 2;
        const maxOd = char.maxOd ?? 2;
        const reactions = char.reactions ?? 1;
        const maxReactions = char.maxReactions ?? 1;
        const hpLog = char.hpLog || [];

        const recentHp = hpLog.slice(-3).map(entry =>
            `${entry.time}: ${entry.delta > 0 ? '+' : ''}${entry.delta} HP`
        ).join(' | ');

        html += `
            <div class="combatant-card ${isCurrent ? 'active-turn' : ''} ${isDead ? 'dead' : ''}" data-id="${id}" style="flex-direction:column; align-items:stretch; gap:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                    <div>
                        <strong>${char.name || 'Безымянный'}</strong>
                        ${char.playerName ? `<span style="color:#887777; font-size:12px;">(${char.playerName})</span>` : ''}
                        <span style="color:#887777; font-size:11px; margin-left:6px;">[${char.role || 'NPC'}]</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-size:13px; ${hpPercent < 25 ? 'color:#cc4444;' : ''}">
                            ${isDead ? '💀' : `${char.wounds}/${char.maxWounds}`}
                        </span>
                        <span style="font-size:11px; color:#887777;">
                            ⚡${od}/${maxOd} 🔄${reactions}/${maxReactions}
                        </span>
                        <span class="status-badge ${char.status || 'alive'}">${char.status || 'alive'}</span>
                        <button class="tab-btn edit-char-btn" data-id="${id}" style="padding:2px 8px; font-size:11px; background:#1a2a3a;">✏️</button>
                    </div>
                </div>
                ${recentHp ? `<div style="font-size:10px; color:#554444; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">${recentHp}</div>` : ''}
            </div>
        `;
    }
    combatantsList.innerHTML = html;

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

async function addCharacterToBattle(charData) {
    try {
        const charId = `char_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await updateDoc(battleRef, {
            [`characters.${charId}`]: {
                ...charData,
                id: charId,
                conditions: [],
                isActive: true,
                joinedAt: serverTimestamp(),
                od: 2,
                maxOd: 2,
                reactions: 1,
                maxReactions: 1,
                hpLog: [],
                isDefending: false,
                dodgeSkill: 0,
                parrySkill: 0
            },
            turnOrder: arrayUnion({ id: charId, initiative: 0, name: charData.name || 'Безымянный' })
        });
        addLogEntry(`👤 ${charData.name} (${charData.role}) добавлен в бой`, 'system');
    } catch (err) {
        console.error(err);
        alert('Ошибка добавления: ' + err.message);
    }
}

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
        enemy: role === 'Враг',
        dodgeSkill: 0,
        parrySkill: 0
    };

    addCharacterToBattle(charData);
}

// ============================================================
// 5.5. РЕДАКТИРОВАНИЕ ПЕРСОНАЖА
// ============================================================

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
                    <label style="color: #887777; display: block; font-size: 13px;">❤️ Текущие раны</label>
                    <input type="number" id="edit-current-wounds" value="${charData.wounds || 12}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">❤️ Максимальные раны</label>
                    <input type="number" id="edit-max-wounds" value="${charData.maxWounds || 12}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">🛡️ Броня (тело)</label>
                    <input type="number" id="edit-armor" value="${charData.armor?.body || 0}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">🛡️ Броня (голова)</label>
                    <input type="number" id="edit-armor-head" value="${charData.armor?.head || 0}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">🛡️ Броня (руки)</label>
                    <input type="number" id="edit-armor-arms" value="${charData.armor?.arms || 0}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">🛡️ Броня (ноги)</label>
                    <input type="number" id="edit-armor-legs" value="${charData.armor?.legs || 0}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">⚡ ОД (макс)</label>
                    <input type="number" id="edit-od" value="${charData.maxOd || 2}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">🔄 Реакции (макс)</label>
                    <input type="number" id="edit-reactions" value="${charData.maxReactions || 1}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">🏃 Уклонение (навык)</label>
                    <input type="number" id="edit-dodge" value="${charData.dodgeSkill || 0}"
                           style="width: 100%; padding: 6px; background: #0a0808; border: 1px solid var(--border-color);
                                  color: var(--text-light); border-radius: 4px;">
                </div>
                <div>
                    <label style="color: #887777; display: block; font-size: 13px;">⚔️ Парирование (навык)</label>
                    <input type="number" id="edit-parry" value="${charData.parrySkill || 0}"
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
            wounds: parseInt(modal.querySelector('#edit-current-wounds').value) || 12,
            maxWounds: parseInt(modal.querySelector('#edit-max-wounds').value) || 12,
            armor: {
                head: parseInt(modal.querySelector('#edit-armor-head').value) || 0,
                body: parseInt(modal.querySelector('#edit-armor').value) || 0,
                arms: parseInt(modal.querySelector('#edit-armor-arms').value) || 0,
                legs: parseInt(modal.querySelector('#edit-armor-legs').value) || 0
            },
            maxOd: parseInt(modal.querySelector('#edit-od').value) || 2,
            maxReactions: parseInt(modal.querySelector('#edit-reactions').value) || 1,
            dodgeSkill: parseInt(modal.querySelector('#edit-dodge').value) || 0,
            parrySkill: parseInt(modal.querySelector('#edit-parry').value) || 0
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
                [`characters.${charId}.wounds`]: updatedData.wounds,
                [`characters.${charId}.maxWounds`]: updatedData.maxWounds,
                [`characters.${charId}.armor`]: updatedData.armor,
                [`characters.${charId}.maxOd`]: updatedData.maxOd,
                [`characters.${charId}.maxReactions`]: updatedData.maxReactions,
                [`characters.${charId}.dodgeSkill`]: updatedData.dodgeSkill,
                [`characters.${charId}.parrySkill`]: updatedData.parrySkill
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
// 5.6. ЗАЩИТА (УКЛОНЕНИЕ / ПАРИРОВАНИЕ)
// ============================================================
async function attemptDefense(battleId, defenderId, attackerId, defenseType) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) return null;

    const data = battleSnap.data();
    const defender = data.characters[defenderId];
    const attacker = data.characters[attackerId];

    if (!defender || defender.isActive === false) return null;

    // Проверка наличия Реакции
    if (defender.reactions < 1) {
        addLogEntry(`${defender.name} не имеет Реакций для защиты`, 'system');
        return { success: false, reason: 'no_reactions' };
    }

    let roll, target, success;
    if (defenseType === 'dodge') {
        const agBonus = Math.floor((defender.ag || 25) / 10);
        const skill = defender.dodgeSkill || 0;
        target = 20 + agBonus * 2 + skill - (skill === 0 ? 20 : 0);
        roll = Math.floor(Math.random() * 100) + 1;
        success = roll <= target;
    } else if (defenseType === 'parry') {
        const wsBonus = Math.floor((defender.ws || 25) / 10);
        const skill = defender.parrySkill || 0;
        target = 20 + wsBonus * 2 + skill - (skill === 0 ? 20 : 0);
        roll = Math.floor(Math.random() * 100) + 1;
        success = roll <= target;
    } else {
        return null;
    }

    // Тратим Реакцию
    await spendReaction(battleId, defenderId);

    const result = {
        type: defenseType,
        roll,
        target,
        success,
        defender: defender.name,
        defenderId: defenderId,
        attacker: attacker?.name || 'неизвестный'
    };

    const emoji = defenseType === 'dodge' ? '🏃' : '⚔️';
    const resultText = success ? '✅ УСПЕХ' : '❌ ПРОВАЛ';
    const skillText = defenseType === 'dodge' ? 'уклониться' : 'парировать';
    addLogEntry(
        `${emoji} ${defender.name} пытается ${skillText} (${roll}/${target}) — ${resultText}`,
        'system'
    );

    return result;
}

// ============================================================
// 5.7. ПОКАЗ ПАНЕЛИ РЕАКЦИЙ (СПРАВА)
// ============================================================
function showDefensePanel(defender, attacker, attackData) {
    if (!defensePanel) return;

    const agBonus = Math.floor((defender.ag || 25) / 10);
    const wsBonus = Math.floor((defender.ws || 25) / 10);
    const dodgeChance = 20 + agBonus * 2 + (defender.dodgeSkill || 0) - ((defender.dodgeSkill || 0) === 0 ? 20 : 0);
    const parryChance = 20 + wsBonus * 2 + (defender.parrySkill || 0) - ((defender.parrySkill || 0) === 0 ? 20 : 0);

    defensePanel.style.display = 'block';
    defensePanel.innerHTML = `
        <div style="background: var(--bg-card); border: 2px solid #cc3300; border-radius: 4px; padding: 16px;">
            <h4 style="color: #cc3300; margin-top: 0;">🛡️ ${defender.name} под атакой!</h4>
            <div style="background: #0a0808; padding: 10px; border-radius: 4px; margin: 8px 0; border-left: 3px solid #cc3300;">
                <div><strong>Атакующий:</strong> ${attacker?.name || 'Противник'}</div>
                <div><strong>Оружие:</strong> ${attackData.weapon || 'Неизвестно'}</div>
                <div><strong>Бросок атаки:</strong> ${attackData.roll}/${attackData.target} ${attackData.isSuccess ? '✅' : '❌'}</div>
                <div><strong>Урон до брони:</strong> ${attackData.rawDamage || 0}</div>
                <div><strong>Реакций:</strong> <span style="color: #ffcc44;">${defender.reactions || 0}</span></div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                <button id="defense-dodge-btn" class="tab-btn" style="flex:1; background: #1a2a3a; border-color: #3a5a7a;">
                    🏃 Уклониться (${dodgeChance}%)
                </button>
                <button id="defense-parry-btn" class="tab-btn" style="flex:1; background: #2a1a3a; border-color: #5a3a7a;">
                    ⚔️ Парировать (${parryChance}%)
                </button>
                <button id="defense-skip-btn" class="tab-btn" style="flex:1; background: #2a1a1a; border-color: #5a2a2a;">
                    ❌ Пропустить
                </button>
            </div>
            <div style="font-size: 11px; color: #554444; margin-top: 8px; border-top: 1px solid #2a1a1a; padding-top: 8px;">
                ⚡ Реакция тратится при попытке защиты (даже при провале)
                ${(defender.dodgeSkill || 0) === 0 ? '<br>⚠️ Без навыка Уклонения штраф -20' : ''}
                ${(defender.parrySkill || 0) === 0 ? '<br>⚠️ Без навыка Парирования штраф -20' : ''}
            </div>
        </div>
    `;

    return new Promise((resolve) => {
        // Сохраняем resolve для использования в обработчиках
        state.defenseResolve = resolve;

        // Обработчики кнопок
        defensePanel.querySelector('#defense-dodge-btn').addEventListener('click', () => {
            defensePanel.style.display = 'none';
            state.defenseResolve('dodge');
            state.defenseResolve = null;
        });
        defensePanel.querySelector('#defense-parry-btn').addEventListener('click', () => {
            defensePanel.style.display = 'none';
            state.defenseResolve('parry');
            state.defenseResolve = null;
        });
        defensePanel.querySelector('#defense-skip-btn').addEventListener('click', () => {
            defensePanel.style.display = 'none';
            state.defenseResolve(null);
            state.defenseResolve = null;
        });
    });
}

function hideDefensePanel() {
    if (defensePanel) {
        defensePanel.style.display = 'none';
        defensePanel.innerHTML = '';
    }
    if (state.defenseResolve) {
        state.defenseResolve(null);
        state.defenseResolve = null;
    }
}

// ============================================================
// 6. ОБРАБОТЧИКИ ДОБАВЛЕНИЯ ПЕРСОНАЖЕЙ
// ============================================================
document.getElementById('add-player-btn')?.addEventListener('click', () => addSimpleCharacter('Игрок', false));
document.getElementById('add-ally-btn')?.addEventListener('click', () => addSimpleCharacter('Союзник', true));
document.getElementById('add-enemy-btn')?.addEventListener('click', () => addSimpleCharacter('Враг', true));

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
            joinedAt: serverTimestamp(),
            reactions: 1,
            maxReactions: 1,
            od: 2,
            maxOd: 2,
            hpLog: [],
            isDefending: false,
            dodgeSkill: 0,
            parrySkill: 0
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

const initQueue = [];

function updateInitSelect() {
    const select = document.getElementById('init-char-select');
    if (!select) return;
    const chars = state.battleData?.characters || {};
    const entries = Object.entries(chars);

    const currentValue = select.value;

    select.innerHTML = '<option value="">Выберите участника</option>';
    entries.forEach(([id, char]) => {
        if (char.isActive !== false && char.status !== 'dead') {
            const agBonus = Math.floor((char.ag || 25) / 10);
            select.innerHTML += `<option value="${id}" data-ag="${agBonus}">${char.name} (Ag: ${agBonus})</option>`;
        }
    });

    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
        const selected = select.options[select.selectedIndex];
        const agBonus = selected?.dataset?.ag || 0;
        document.getElementById('init-ag-display').textContent = agBonus;
    } else {
        document.getElementById('init-ag-display').textContent = '0';
    }
}

document.getElementById('init-char-select')?.addEventListener('change', (e) => {
    const select = e.target;
    const selected = select.options[select.selectedIndex];
    const agBonus = selected?.dataset?.ag || 0;
    document.getElementById('init-ag-display').textContent = agBonus;
});

document.getElementById('init-roll-btn')?.addEventListener('click', () => {
    const select = document.getElementById('init-char-select');
    if (!select || !select.value) {
        alert('Выберите участника');
        return;
    }
    const selected = select.options[select.selectedIndex];
    const charId = select.value;
    const name = selected.text.split(' (')[0];
    const agBonus = parseInt(selected.dataset.ag) || 0;
    const roll = Math.floor(Math.random() * 10) + 1;
    const total = roll + agBonus;

    const existing = initQueue.find(item => item.charId === charId);
    if (existing) {
        existing.roll = roll;
        existing.total = total;
    } else {
        initQueue.push({ charId, name, agBonus, roll, total });
    }

    renderInitQueue();
    addLogEntry(`🎲 ${name} бросает инициативу: ${roll} + ${agBonus} = ${total}`, 'system');
});

document.getElementById('init-auto-btn')?.addEventListener('click', () => {
    const chars = state.battleData?.characters || {};
    const entries = Object.entries(chars);
    if (entries.length === 0) {
        alert('Нет участников для расчёта инициативы');
        return;
    }

    initQueue.length = 0;

    entries.forEach(([id, char]) => {
        if (char.isActive !== false && char.status !== 'dead') {
            const agBonus = Math.floor((char.ag || 25) / 10);
            const roll = Math.floor(Math.random() * 10) + 1;
            const total = roll + agBonus;
            initQueue.push({
                charId: id,
                name: char.name || 'Безымянный',
                agBonus: agBonus,
                roll: roll,
                total: total
            });
        }
    });

    initQueue.sort((a, b) => b.total - a.total);
    renderInitQueue();
    addLogEntry(`⚡ Инициатива рассчитана для ${initQueue.length} участников`, 'system');
});

document.getElementById('init-apply-btn')?.addEventListener('click', async () => {
    if (initQueue.length === 0) {
        alert('Очередь инициативы пуста');
        return;
    }

    const sorted = [...initQueue].sort((a, b) => b.total - a.total);
    const turnOrder = sorted.map(item => ({
        id: item.charId,
        initiative: item.total,
        name: item.name
    }));

    try {
        await updateDoc(battleRef, {
            turnOrder: turnOrder,
            currentTurnIndex: 0,
            currentPlayerId: turnOrder.length > 0 ? turnOrder[0].id : null,
            turn: 1
        });
        addLogEntry(`⚡ Инициатива применена: ${turnOrder.map((t, i) => `${i + 1}. ${t.name} (${t.initiative})`).join(' → ')}`, 'system');
        initQueue.length = 0;
        renderInitQueue();
        updateInitOrderDisplay({ turnOrder: turnOrder });
    } catch (err) {
        console.error(err);
        alert('Ошибка применения инициативы: ' + err.message);
    }
});

document.getElementById('init-clear-btn')?.addEventListener('click', () => {
    if (initQueue.length === 0) return;
    if (confirm('Очистить очередь инициативы?')) {
        initQueue.length = 0;
        renderInitQueue();
        addLogEntry('🗑️ Очередь инициативы очищена', 'system');
    }
});

function renderInitQueue() {
    const container = document.getElementById('init-queue');
    if (!container) return;
    if (initQueue.length === 0) {
        container.innerHTML = '<span style="color:#554444; font-size:13px;">Очередь пуста</span>';
        return;
    }
    const sorted = [...initQueue].sort((a, b) => b.total - a.total);
    container.innerHTML = sorted.map((item, index) =>
        `<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span><strong>${item.name}</strong> (Ag: ${item.agBonus}) → бросок ${item.roll} = <span class="dice-roll">${item.total}</span></span>
            <button class="tab-btn" style="padding:2px 8px; font-size:11px; background:#3a1a1a;" data-charid="${item.charId}">✕</button>
        </div>`
    ).join('');

    container.querySelectorAll('button[data-charid]').forEach(btn => {
        btn.addEventListener('click', () => {
            const charId = btn.dataset.charid;
            const index = initQueue.findIndex(item => item.charId === charId);
            if (index !== -1) {
                initQueue.splice(index, 1);
                renderInitQueue();
                addLogEntry(`❌ Удалён из очереди инициативы`, 'system');
            }
        });
    });
}

function updateInitOrderDisplay(data) {
    if (!initOrderDisplay) return;
    const turnOrder = data?.turnOrder || state.battleData?.turnOrder || [];
    if (turnOrder.length === 0) {
        initOrderDisplay.innerHTML = '<span style="color:#554444; font-size:13px;">Нет порядка инициативы</span>';
        return;
    }
    const currentIndex = data?.currentTurnIndex || state.battleData?.currentTurnIndex || 0;
    initOrderDisplay.innerHTML = turnOrder.map((item, index) => {
        const isCurrent = index === currentIndex;
        const isDead = state.battleData?.characters?.[item.id]?.status === 'dead';
        return `<div style="display:flex; justify-content:space-between; padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.05); 
                    ${isCurrent ? 'background: rgba(204, 51, 0, 0.15); border-left: 3px solid #cc3300;' : ''}
                    ${isDead ? 'opacity: 0.3; text-decoration: line-through;' : ''}">
            <span>${isCurrent ? '▶️' : ''} <strong>${item.name}</strong></span>
            <span style="color: #ffcc44;">${item.initiative}</span>
        </div>`;
    }).join('');
}

// ============================================================
// 8. УПРАВЛЕНИЕ РАУНДАМИ
// ============================================================

document.getElementById('next-round-btn')?.addEventListener('click', async () => {
    try {
        const data = state.battleData;
        if (!data) return;
        const currentRound = data.turn || 0;
        await updateDoc(battleRef, { turn: currentRound + 1 });
        addLogEntry(`🔁 Раунд ${currentRound + 1} начался`, 'system');
    } catch (err) {
        console.error(err);
        alert('Ошибка: ' + err.message);
    }
});

document.getElementById('prev-round-btn')?.addEventListener('click', async () => {
    try {
        const data = state.battleData;
        if (!data) return;
        const currentRound = data.turn || 0;
        if (currentRound <= 0) {
            alert('Нельзя уменьшить раунд ниже 0');
            return;
        }
        await updateDoc(battleRef, { turn: currentRound - 1 });
        addLogEntry(`⬅️ Раунд ${currentRound - 1}`, 'system');
    } catch (err) {
        console.error(err);
        alert('Ошибка: ' + err.message);
    }
});

// ============================================================
// 8.1. СЛЕДУЮЩИЙ ХОД
// ============================================================
document.getElementById('next-turn-btn')?.addEventListener('click', async () => {
    console.log('⏩ Ход следующего участника нажат');
    try {
        const data = state.battleData;
        if (!data) return;
        const turnOrder = data.turnOrder || [];
        if (turnOrder.length === 0) {
            alert('Нет очереди инициативы');
            return;
        }

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

        const nextId = turnOrder[nextIndex].id;
        await resetReactions(state.battleId, nextId);

        await updateDoc(battleRef, {
            currentTurnIndex: nextIndex,
            currentPlayerId: nextId
        });
        addLogEntry(`⏩ Ход передан участнику ${turnOrder[nextIndex].name} (Реакции восстановлены)`, 'system');
        updateInitOrderDisplay({ turnOrder: turnOrder, currentTurnIndex: nextIndex });
    } catch (err) {
        console.error(err);
        addLogEntry(`❌ Ошибка перехода хода: ${err.message}`, 'system');
    }
});

// ============================================================
// 8.2. ПРЕДЫДУЩИЙ ХОД
// ============================================================
document.getElementById('prev-turn-btn')?.addEventListener('click', async () => {
    try {
        const data = state.battleData;
        if (!data) return;
        const turnOrder = data.turnOrder || [];
        if (turnOrder.length === 0) {
            alert('Нет очереди инициативы');
            return;
        }

        const currentIndex = data.currentTurnIndex || 0;
        let prevIndex = currentIndex - 1;
        let attempts = 0;
        const maxAttempts = turnOrder.length * 2;

        while (attempts < maxAttempts) {
            if (prevIndex < 0) {
                prevIndex = turnOrder.length - 1;
            }
            const prevId = turnOrder[prevIndex]?.id;
            if (prevId && data.characters[prevId]?.isActive !== false) break;
            prevIndex--;
            attempts++;
        }

        if (attempts >= maxAttempts) {
            alert('Нет живых участников для возврата');
            return;
        }

        await updateDoc(battleRef, {
            currentTurnIndex: prevIndex,
            currentPlayerId: turnOrder[prevIndex].id
        });

        addLogEntry(`⬅️ Возврат к ходу участника ${turnOrder[prevIndex].name}`, 'system');
        updateInitOrderDisplay({ turnOrder: turnOrder, currentTurnIndex: prevIndex });
    } catch (err) {
        console.error(err);
        alert('Ошибка: ' + err.message);
    }
});

// ============================================================
// 8.3. КОНЕЦ БОЯ
// ============================================================
document.getElementById('end-battle-btn')?.addEventListener('click', async () => {
    if (!confirm('⛔ Завершить бой? Это действие необратимо.')) return;
    try {
        await updateDoc(battleRef, {
            isActive: false,
            isFinished: true,
            finishedAt: serverTimestamp()
        });
        addLogEntry('⛔ БОЙ ЗАВЕРШЁН', 'system');
        alert('Бой завершён');
    } catch (err) {
        console.error(err);
        alert('Ошибка: ' + err.message);
    }
});

// ============================================================
// 9. АТАКА (С ПАНЕЛЬЮ РЕАКЦИЙ СПРАВА)
// ============================================================
document.getElementById('attack-btn')?.addEventListener('click', async () => {
    console.log('💥 Атака нажата');

    // Скрываем старую панель реакций
    hideDefensePanel();

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

        // ===== ШАГ 1: БРОСОК АТАКИ =====
        const target = threshold + modifier + (isFull ? 10 : 0) + (isAllOut ? 30 : 0);
        const roll = Math.floor(Math.random() * 100) + 1;
        const isSuccess = roll <= target;
        const degrees = isSuccess ? Math.floor((target - roll) / 10) + 1 : Math.floor((roll - target) / 10) + 1;
        const hitLocation = ['Голова', 'Правая рука', 'Левая рука', 'Торс', 'Правая нога', 'Левая нога'][Math.floor(Math.random() * 6)];

        // ===== ШАГ 2: РАСЧЁТ УРОНА =====
        let rawDamage = 0;
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
                    rawDamage = total + mod + Math.floor((degrees - 1) / 2);
                    if (rawDamage < 0) rawDamage = 0;
                } else {
                    rawDamage = parseInt(damageDice) || 0;
                }
            } catch (e) {
                rawDamage = 0;
            }
        }

        // ===== ШАГ 3: ПОКАЗ РЕЗУЛЬТАТА АТАКИ =====
        const resultDiv = document.getElementById('attack-result');
        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div><strong>${attacker.name}</strong> → <strong>${defender.name}</strong></div>
                <div>⚔️ ${weaponName}</div>
                <div>🎯 Бросок: ${roll} (Цель: ${target}) ${isSuccess ? '✅ ПОПАДАНИЕ' : '❌ ПРОМАХ'}</div>
                <div>📊 Уровней успеха: ${isSuccess ? '+' : ''}${degrees}</div>
                <div>🎯 Место попадания: ${hitLocation}</div>
                <div>🎲 Урон до брони: ${isSuccess ? rawDamage : 'промах'}</div>
                ${damageRolls.length > 0 ? `<div>🎲 Броски: [${damageRolls.join(', ')}]</div>` : ''}
                ${isSuccess && rawDamage > 0 ? `<div style="color:#ff8800; margin-top:8px;">🛡️ Ожидание реакции защиты...</div>` : ''}
                ${!isSuccess ? '<div style="color:#887777;">❌ Промах</div>' : ''}
            `;
        }

        // ===== ШАГ 4: ЕСЛИ ПОПАДАНИЕ — ПОКАЗЫВАЕМ ПАНЕЛЬ РЕАКЦИЙ =====
        let finalDamage = 0;
        let defenseResult = null;

        if (isSuccess && rawDamage > 0 && defender.reactions > 0 && !defender.isDefending) {
            const attackData = {
                weapon: weaponName,
                roll: roll,
                target: target,
                isSuccess: isSuccess,
                rawDamage: rawDamage,
                attacker: attacker.name
            };

            // Показываем панель реакций справа
            const defenseType = await showDefensePanel(defender, attacker, attackData);

            if (defenseType) {
                defenseResult = await attemptDefense(state.battleId, defenderId, attackerId, defenseType);

                if (defenseResult?.success) {
                    addLogEntry(`🛡️ ${defender.name} ${defenseType === 'dodge' ? 'уклонился' : 'парировал'} атаку! Урон отменён.`, 'system');
                    finalDamage = 0;
                } else if (defenseResult && !defenseResult.success) {
                    addLogEntry(`${defender.name} пытался защититься, но не смог. Урон наносится.`, 'system');
                    const armor = defender.armor || { head: 0, body: 0, arms: 0, legs: 0 };
                    const armorKey = hitLocation === 'Голова' ? 'head' :
                        hitLocation === 'Торс' ? 'body' :
                            hitLocation === 'Правая рука' || hitLocation === 'Левая рука' ? 'arms' : 'legs';
                    const armorValue = armor[armorKey] || 0;
                    finalDamage = Math.max(0, rawDamage - armorValue);
                }
            } else {
                // Пропустили защиту
                const armor = defender.armor || { head: 0, body: 0, arms: 0, legs: 0 };
                const armorKey = hitLocation === 'Голова' ? 'head' :
                    hitLocation === 'Торс' ? 'body' :
                        hitLocation === 'Правая рука' || hitLocation === 'Левая рука' ? 'arms' : 'legs';
                const armorValue = armor[armorKey] || 0;
                finalDamage = Math.max(0, rawDamage - armorValue);
            }
        } else if (isSuccess && rawDamage > 0) {
            if (defender.reactions < 1) {
                addLogEntry(`${defender.name} не имеет Реакций для защиты.`, 'system');
            }
            const armor = defender.armor || { head: 0, body: 0, arms: 0, legs: 0 };
            const armorKey = hitLocation === 'Голова' ? 'head' :
                hitLocation === 'Торс' ? 'body' :
                    hitLocation === 'Правая рука' || hitLocation === 'Левая рука' ? 'arms' : 'legs';
            const armorValue = armor[armorKey] || 0;
            finalDamage = Math.max(0, rawDamage - armorValue);
        }

        // ===== ШАГ 5: ПРИМЕНЕНИЕ УРОНА =====
        if (isSuccess && finalDamage > 0) {
            await applyDamage(state.battleId, defenderId, finalDamage, {
                attacker: attacker.name,
                defender: defender.name,
                isSuccess: true,
                roll: roll,
                target: target
            });
        } else if (isSuccess && finalDamage <= 0 && rawDamage > 0) {
            addLogEntry(`${attacker.name} атакует ${defender.name} — Урон поглощён броней!`, 'system');
        }

        // ===== ШАГ 6: ОБНОВЛЕНИЕ РЕЗУЛЬТАТА =====
        if (resultDiv) {
            let defenseText = '';
            if (defenseResult?.success) {
                defenseText = `<div style="color:#66aa66;">🛡️ ${defender.name} ${defenseResult.type === 'dodge' ? 'уклонился' : 'парировал'}!</div>`;
            } else if (defenseResult && !defenseResult.success) {
                defenseText = `<div style="color:#ff8800;">❌ ${defender.name} не смог защититься (${defenseResult.roll}/${defenseResult.target})</div>`;
            }

            resultDiv.innerHTML = `
                <div><strong>${attacker.name}</strong> → <strong>${defender.name}</strong></div>
                <div>⚔️ ${weaponName}</div>
                <div>🎯 Бросок: ${roll} (Цель: ${target}) ${isSuccess ? '✅' : '❌'}</div>
                <div>📊 Уровней успеха: ${isSuccess ? '+' : ''}${degrees}</div>
                <div>🎯 Место попадания: ${hitLocation}</div>
                <div>🎲 Урон до брони: ${isSuccess ? rawDamage : 'промах'}</div>
                ${damageRolls.length > 0 ? `<div>🎲 Броски: [${damageRolls.join(', ')}]</div>` : ''}
                ${defenseText}
                ${isSuccess && finalDamage > 0 ? `<div style="color:#cc4444; font-weight:bold;">💥 Итоговый урон: ${finalDamage}</div>` : ''}
                ${isSuccess && finalDamage === 0 && rawDamage > 0 && !defenseResult?.success ? '<div style="color:#887777;">🛡️ Урон поглощён броней</div>' : ''}
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
document.querySelectorAll('.dice-insert-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const dice = btn.dataset.dice;
        const input = document.getElementById('dice-custom-input');
        if (input) {
            if (input.value.trim() === '') {
                input.value = dice;
            } else {
                input.value += `+${dice}`;
            }
        }
    });
});

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
        input.value = '';
    } catch (e) {
        addLogEntry(`❌ Ошибка броска: ${e.message}`, 'system');
    }
});

// ============================================================
// 11. ЗАМЕТКИ GM
// ============================================================
document.getElementById('save-notes-btn')?.addEventListener('click', () => {
    const notes = document.getElementById('gm-notes')?.value || '';
    localStorage.setItem(`battle_${state.battleId}_notes`, notes);
    addLogEntry('📝 Заметки сохранены', 'system');
});

const savedNotes = localStorage.getItem(`battle_${state.battleId}_notes`);
if (savedNotes && document.getElementById('gm-notes')) {
    document.getElementById('gm-notes').value = savedNotes;
}

// ============================================================
// 12. ЭКСПОРТ / ИМПОРТ ЛОГА
// ============================================================

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