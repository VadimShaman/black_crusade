// js/battle/battle-status.js
// ============================================================
// УПРАВЛЕНИЕ СТАТУСАМИ, УРОНОМ И РЕАКЦИЯМИ
// ============================================================

import { db } from '../firebase-config.js';
import { doc, getDoc, updateDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { addLog } from './battle-log.js';

// ============================================================
// 1. ПРИМЕНЕНИЕ УРОНА
// ============================================================
export async function applyDamage(battleId, charId, damage, attackResult = null) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) return;

    const data = battleSnap.data();
    const char = data.characters[charId];
    if (!char) return;
    if (char.status === 'dead' || !char.isActive) return;

    // Применяем урон
    let wounds = char.wounds - damage;
    const isDead = wounds <= -char.maxWounds;

    let conditions = char.conditions || [];
    let status = char.status || 'alive';

    if (isDead) {
        status = 'dead';
        char.isActive = false;
        // Увеличиваем счётчик убийств
        const kills = (data.kills || 0) + 1;
        await updateDoc(battleRef, { kills: kills });
    } else if (wounds <= 0 && char.status !== 'dead') {
        status = 'critical';
        if (!conditions.includes('bloodloss')) {
            conditions.push('bloodloss');
        }
    }

    // Лог HP
    const hpLog = char.hpLog || [];
    hpLog.push({
        time: new Date().toLocaleTimeString(),
        delta: -damage,
        current: wounds
    });
    if (hpLog.length > 10) hpLog.shift();

    await updateDoc(battleRef, {
        [`characters.${charId}.wounds`]: wounds,
        [`characters.${charId}.status`]: status,
        [`characters.${charId}.isActive`]: !isDead,
        [`characters.${charId}.conditions`]: conditions,
        [`characters.${charId}.hpLog`]: hpLog,
        [`characters.${charId}.isDefending`]: false
    });

    if (attackResult && damage > 0) {
        const logEntry = {
            time: new Date().toLocaleTimeString(),
            text: `${attackResult.attacker} → ${char.name}: ${attackResult.isSuccess ? 'ПОПАДАНИЕ' : 'ПРОМАХ'} (${attackResult.roll}/${attackResult.target})`,
            damage: damage,
            target: charId,
            isDead: isDead
        };
        await addLog(battleId, logEntry);
    }

    return { wounds, status, isDead };
}

// ============================================================
// 2. СТАТУСЫ (CONDITIONS)
// ============================================================
export async function addCondition(battleId, charId, status, duration = 1) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) return;

    const char = battleSnap.data().characters[charId];
    if (!char) return;

    const conditions = char.conditions || [];
    const existing = conditions.find(c => c.name === status);
    if (existing) {
        existing.duration = Math.max(existing.duration, duration);
        existing.remaining = existing.duration;
        await updateDoc(battleRef, {
            [`characters.${charId}.conditions`]: conditions
        });
    } else {
        await updateDoc(battleRef, {
            [`characters.${charId}.conditions`]: arrayUnion({
                name: status,
                duration: duration,
                remaining: duration,
                appliedAt: Date.now()
            })
        });
    }
}

export async function removeCondition(battleId, charId, status) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) return;

    const char = battleSnap.data().characters[charId];
    if (!char) return;

    const conditions = (char.conditions || []).filter(c => c.name !== status);
    await updateDoc(battleRef, {
        [`characters.${charId}.conditions`]: conditions
    });
}

// ============================================================
// 3. РЕАКЦИИ
// ============================================================

/**
 * Проверяет, есть ли у персонажа Реакция
 */
export function hasReaction(char) {
    return char && char.reactions > 0;
}

/**
 * Расходует Реакцию персонажа
 */
export async function spendReaction(battleId, charId) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) return false;

    const char = battleSnap.data().characters[charId];
    if (!char || char.reactions < 1) return false;

    await updateDoc(battleRef, {
        [`characters.${charId}.reactions`]: char.reactions - 1
    });
    return true;
}

/**
 * Восстанавливает Реакции в начале хода
 */
export async function resetReactions(battleId, charId) {
    const battleRef = doc(db, 'battles', battleId);
    await updateDoc(battleRef, {
        [`characters.${charId}.reactions`]: 1,
        [`characters.${charId}.maxReactions`]: 1,
        [`characters.${charId}.isDefending`]: false
    });
}

// ============================================================
// 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Рассчитывает шанс на уклонение или парирование
 */
export function calculateDefenseChance(char, type) {
    if (!char) return { target: 0, roll: 0, success: false };

    const baseStat = type === 'dodge' ? (char.ag || 25) : (char.ws || 25);
    const bonus = type === 'dodge' ? (char.dodgeSkill || 0) : (char.parrySkill || 0);
    let target = baseStat + bonus;

    // Модификаторы
    if (char.isDefending) target += 10;
    if (char.isProne) target -= 20;
    if (char.fatigue) target -= char.fatigue * 10;

    // Не может быть меньше 5
    target = Math.max(5, target);

    return {
        target: target,
        hasReaction: (char.reactions || 0) > 0,
        maxReactions: char.maxReactions || 1
    };
}

/**
 * Форматирует шанс для отображения
 */
export function formatDefenseChance(char, type) {
    const result = calculateDefenseChance(char, type);
    if (!result.hasReaction) return 'Нет Реакций ❌';
    return `${type === 'dodge' ? '🏃' : '⚔️'} ${result.target}%`;
}