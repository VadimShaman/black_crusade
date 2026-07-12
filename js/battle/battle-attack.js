// js/battle/battle-attack.js
import { db } from '../firebase-config.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { applyDamage } from './battle-status.js';
import { addLog } from './battle-log.js';

// ============================================================
// 1. КАЛЬКУЛЯТОР АТАКИ
// ============================================================
export function calculateAttack(attacker, defender, options = {}) {
    const {
        weapon = attacker.weapon || 'Кулак',
        isRanged = false,
        rangeModifier = 0,
        aimingBonus = 0,
        isFullAttack = false,
        isAllOutAttack = false
    } = options;

    const baseStat = isRanged ? (attacker.bs || 25) : (attacker.ws || 25);
    let modifiers = rangeModifier + aimingBonus;
    if (isFullAttack) modifiers += 10;
    if (isAllOutAttack) modifiers += 30;
    if (attacker.fatigue) modifiers -= attacker.fatigue * 10;

    const target = baseStat + modifiers;
    const roll = Math.floor(Math.random() * 100) + 1;
    const isSuccess = roll <= target;

    let degrees = 0;
    if (isSuccess) {
        degrees = Math.floor((target - roll) / 10) + 1;
    } else {
        degrees = Math.floor((roll - target) / 10) + 1;
    }

    const isCritSuccess = roll <= 5 && isSuccess;
    const isCritFail = roll >= 96 && !isSuccess;
    const hitLocation = getHitLocation(roll);

    let baseDamage = getWeaponDamage(weapon, attacker);
    if (isSuccess) {
        baseDamage += Math.floor((degrees - 1) / 2);
    }

    let armor = defender.armor || { head: 0, body: 0, arms: 0, legs: 0 };
    let armorValue = armor[hitLocation] || 0;
    const pen = getWeaponPen(weapon);
    const effectiveArmor = Math.max(0, armorValue - pen);

    let finalDamage = Math.max(0, baseDamage - effectiveArmor);

    let isCritical = false;
    if (finalDamage > 0) {
        const dmgRoll = Math.floor(Math.random() * 10) + 1;
        if (dmgRoll === 10) isCritical = true;
    }

    return {
        attacker: attacker.name || 'Атакующий',
        defender: defender.name || 'Защищающийся',
        roll,
        target,
        isSuccess,
        degrees: isSuccess ? degrees : -degrees,
        isCritSuccess,
        isCritFail,
        hitLocation,
        baseDamage,
        armorValue,
        effectiveArmor,
        finalDamage,
        isCritical,
        weapon: weapon,
        modifiers: modifiers,
        pen: pen
    };
}

function getHitLocation(roll) {
    const reversed = parseInt(roll.toString().split('').reverse().join(''));
    if (reversed <= 10) return 'head';
    if (reversed <= 20) return 'rightArm';
    if (reversed <= 30) return 'leftArm';
    if (reversed <= 70) return 'body';
    if (reversed <= 85) return 'rightLeg';
    return 'leftLeg';
}

function getWeaponDamage(weapon, attacker) {
    const weaponMap = {
        'Мясницкий тесак': 8,
        'Ритуальный нож': 4,
        'Когти': 6,
        'Огненные когти': 14,
        'Кулак': 3,
        'Тяжёлый автопистолет': 8,
        'Автопистолет': 5,
        'Теневая магия': 10,
        'Пылающие струи': 9
    };
    const base = weaponMap[weapon] || 4;
    const strBonus = Math.floor((attacker.s || 25) / 10) * 2;
    return base + strBonus;
}

function getWeaponPen(weapon) {
    const penMap = {
        'Мясницкий тесак': 2,
        'Ритуальный нож': 1,
        'Когти': 2,
        'Огненные когти': 4,
        'Кулак': 0,
        'Тяжёлый автопистолет': 3,
        'Автопистолет': 2,
        'Теневая магия': 4,
        'Пылающие струи': 6
    };
    return penMap[weapon] || 1;
}

// ============================================================
// 2. ВЫПОЛНЕНИЕ АТАКИ (связывает калькулятор и применение урона)
// ============================================================
export async function performAttack(battleId, attackerId, defenderId, options = {}) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) throw new Error('Бой не найден');

    const data = battleSnap.data();
    const attacker = data.characters[attackerId];
    const defender = data.characters[defenderId];

    if (!attacker || !defender) throw new Error('Персонаж не найден');
    if (!attacker.isActive || !defender.isActive) throw new Error('Персонаж не активен');

    const result = calculateAttack(attacker, defender, options);

    if (result.isSuccess && result.finalDamage > 0) {
        await applyDamage(battleId, defenderId, result.finalDamage, result);
    } else if (result.isSuccess && result.finalDamage <= 0) {
        await addLog(battleId, {
            time: new Date().toLocaleTimeString(),
            text: `${attacker.name} атакует ${defender.name} — Урон поглощён броней!`,
            isSystem: true
        });
    } else if (!result.isSuccess) {
        await addLog(battleId, {
            time: new Date().toLocaleTimeString(),
            text: `${attacker.name} промахивается по ${defender.name} (Бросок: ${result.roll}, Цель: ${result.target})`,
            isSystem: true
        });
    }

    if (result.isCritFail) {
        await addLog(battleId, {
            time: new Date().toLocaleTimeString(),
            text: `💥 ${attacker.name} критически проваливается! Оружие выпадает из рук!`,
            isSystem: true
        });
    }

    return result;
}