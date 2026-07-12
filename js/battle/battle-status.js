// js/battle/battle-status.js
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

    let wounds = char.wounds - damage;
    const isDead = wounds <= -char.maxWounds;

    let conditions = char.conditions || [];
    let status = char.status || 'alive';

    if (isDead) {
        status = 'dead';
        char.isActive = false;
    } else if (wounds <= 0 && char.status !== 'dead') {
        status = 'critical';
        if (!conditions.includes('bloodloss')) {
            conditions.push('bloodloss');
        }
    }

    await updateDoc(battleRef, {
        [`characters.${charId}.wounds`]: wounds,
        [`characters.${charId}.status`]: status,
        [`characters.${charId}.isActive`]: !isDead,
        [`characters.${charId}.conditions`]: conditions
    });

    if (attackResult) {
        const logEntry = {
            time: new Date().toLocaleTimeString(),
            text: `${attackResult.attacker} → ${attackResult.defender}: ${attackResult.isSuccess ? 'ПОПАДАНИЕ' : 'ПРОМАХ'} (${attackResult.roll}/${attackResult.target})`,
            damage: damage,
            target: charId,
            isDead: isDead
        };
        await addLog(battleId, logEntry);
    }

    return { wounds, status, isDead };
}

// ============================================================
// 2. СТАТУСЫ
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