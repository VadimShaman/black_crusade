// js/battle/battle-status.js
import { db } from '../firebase-config.js';
import { doc, getDoc, updateDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { addLog } from './battle-log.js';

export async function applyDamageWithDefense(battleId, charId, damage, attackResult = null) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) return;

    const data = battleSnap.data();
    const char = data.characters[charId];
    if (!char) return;
    if (char.status === 'dead' || !char.isActive) return;

    // Защита будет вызываться из battle-init, здесь просто применяем урон
    let wounds = char.wounds - damage;
    const isDead = wounds <= -char.maxWounds;

    let conditions = char.conditions || [];
    let status = char.status || 'alive';

    if (isDead) {
        status = 'dead';
        char.isActive = false;
    } else if (wounds <= 0 && char.status !== 'dead') {
        status = 'critical';
        if (!conditions.includes('bloodloss')) conditions.push('bloodloss');
    }

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

    if (attackResult) {
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

// Остальные функции (addCondition, removeCondition) без изменений
export async function addCondition(battleId, charId, status, duration = 1) { ... }
export async function removeCondition(battleId, charId, status) { ... }