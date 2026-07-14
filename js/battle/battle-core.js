// js/battle/battle-core.js
import { db } from '../firebase-config.js';
import {
    collection, doc, getDoc, addDoc, updateDoc, deleteDoc,
    onSnapshot, query, where, arrayUnion, arrayRemove,
    runTransaction, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { addLog, subscribeToLog } from './battle-log.js';

// ============================================================
// 1. ШАБЛОНЫ NPC
// ============================================================
export const NPC_TEMPLATES = {
    cultist: {
        name: 'Культист',
        ws: 25, bs: 25, s: 25, t: 25, ag: 25, int: 25, per: 25, wp: 25, fel: 25,
        wounds: 10, maxWounds: 10,
        armor: { head: 0, body: 0, arms: 0, legs: 0 },
        weapon: 'Ритуальный нож',
        traits: [],
        status: 'alive',
        isNPC: true
    },
    beastman: {
        name: 'Зверолюд',
        ws: 35, bs: 20, s: 35, t: 35, ag: 25, int: 15, per: 30, wp: 20, fel: 10,
        wounds: 14, maxWounds: 14,
        armor: { head: 2, body: 2, arms: 1, legs: 1 },
        weapon: 'Когти',
        traits: ['Мутант', 'Чувство крови'],
        status: 'alive',
        isNPC: true
    },
    albino: {
        name: 'Шепчущий из Теней (Альбинос)',
        ws: 55, bs: 35, s: 50, t: 55, ag: 45, int: 55, per: 60, wp: 85, fel: 20,
        wounds: 25, maxWounds: 25,
        armor: { head: 4, body: 4, arms: 4, legs: 4 },
        weapon: 'Когти + Теневая магия',
        traits: ['Альбинос', 'Псайкер-Отродье', 'Метка Тзинча'],
        status: 'alive',
        isNPC: true,
        isBoss: true
    },
    flamingPredator: {
        name: 'Пылающий Хищник (Отродье Кхорна)',
        ws: 55, bs: 25, s: 60, t: 55, ag: 30, int: 0, per: 25, wp: 45, fel: 0,
        wounds: 24, maxWounds: 24,
        armor: { head: 6, body: 6, arms: 6, legs: 6 },
        weapon: 'Огненные когти',
        traits: ['Отродье Кхорна', 'Пиромантия', 'Fear(4)', 'Regeneration(1d5)'],
        status: 'alive',
        isNPC: true,
        isBoss: true
    },
    gregor: {
        name: 'Грегор Мясник',
        ws: 45, bs: 30, s: 45, t: 45, ag: 25, int: 25, per: 35, wp: 30, fel: 20,
        wounds: 16, maxWounds: 16,
        armor: { head: 0, body: 2, arms: 0, legs: 0 },
        weapon: 'Мясницкий тесак',
        traits: ['Ветеран', 'Верность Колдуну', 'Кровавая Ярость'],
        status: 'alive',
        isNPC: true
    }
};

// ============================================================
// 2. СОЗДАНИЕ БОЯ
// ============================================================
export async function createBattle(battleName = `Бой ${new Date().toLocaleTimeString()}`, initialCharacters = []) {
    const battleData = {
        name: battleName,
        createdAt: serverTimestamp(),
        isActive: true,
        turn: 0,
        turnOrder: [],
        currentTurnIndex: 0,
        currentPlayerId: null,
        characters: {},
        log: [],
        isFinished: false
    };
    initialCharacters.forEach((char, index) => {
        const id = `char_${Date.now()}_${index}`;
        battleData.characters[id] = {
            ...char,
            id: id,
            wounds: char.maxWounds || char.wounds || 10,
            conditions: [],
            isActive: true
        };
        battleData.turnOrder.push({ id, initiative: 0, name: char.name || 'Безымянный' });
    });
    const docRef = await addDoc(collection(db, 'battles'), battleData);
    return docRef.id;
}

// ============================================================
// 3. ПОДПИСКА НА БОЙ
// ============================================================
export function subscribeToBattle(battleId, callback) {
    const docRef = doc(db, 'battles', battleId);
    return onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
            callback({ id: snapshot.id, ...snapshot.data() });
        } else {
            callback(null);
        }
    }, (error) => {
        console.error('❌ Ошибка подписки:', error);
        callback(null);
    });
}

// ============================================================
// 4. ДОБАВЛЕНИЕ/УДАЛЕНИЕ ПЕРСОНАЖЕЙ
// ============================================================
export async function addCharacter(battleId, character, playerName = 'Игрок') {
    const battleRef = doc(db, 'battles', battleId);
    const charId = `char_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const charData = {
        ...character,
        id: charId,
        wounds: character.maxWounds || character.wounds || 10,
        maxWounds: character.maxWounds || character.wounds || 10,
        conditions: [],
        isActive: true,
        playerName: playerName,
        joinedAt: serverTimestamp()
    };
    await updateDoc(battleRef, {
        [`characters.${charId}`]: charData,
        turnOrder: arrayUnion({ id: charId, initiative: 0, name: charData.name || 'Безымянный' })
    });
    return charId;
}

export async function removeCharacter(battleId, charId) {
    const battleRef = doc(db, 'battles', battleId);
    await updateDoc(battleRef, {
        [`characters.${charId}`]: deleteField(),
        turnOrder: arrayRemove({ id: charId })
    });
}

// ============================================================
// 5. ИНИЦИАТИВА
// ============================================================
export async function rollInitiative(battleId) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) throw new Error('Бой не найден');

    const data = battleSnap.data();
    const chars = data.characters || {};
    const turnOrder = [];

    for (const [id, char] of Object.entries(chars)) {
        if (!char.isActive) continue;
        const agBonus = Math.floor((char.ag || 25) / 10);
        const roll = Math.floor(Math.random() * 10) + 1;
        const initiative = roll + agBonus;
        turnOrder.push({ id, initiative, name: char.name || 'Безымянный' });
    }

    turnOrder.sort((a, b) => b.initiative - a.initiative);

    await updateDoc(battleRef, {
        turnOrder: turnOrder,
        currentTurnIndex: 0,
        currentPlayerId: turnOrder.length > 0 ? turnOrder[0].id : null,
        turn: (data.turn || 0) + 1
    });

    return turnOrder;
}

// ============================================================
// 6. СЛЕДУЮЩИЙ ХОД
// ============================================================
export async function nextTurn(battleId) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) throw new Error('Бой не найден');

    const data = battleSnap.data();
    const turnOrder = data.turnOrder || [];
    if (turnOrder.length === 0) return;

    let nextIndex = (data.currentTurnIndex || 0) + 1;
    let attempts = 0;
    const maxAttempts = turnOrder.length * 2;

    while (attempts < maxAttempts) {
        if (nextIndex >= turnOrder.length) {
            nextIndex = 0;
        }
        const nextId = turnOrder[nextIndex]?.id;
        if (nextId && data.characters[nextId]?.isActive !== false) {
            break;
        }
        nextIndex++;
        attempts++;
    }

    if (attempts >= maxAttempts) {
        await updateDoc(battleRef, {
            isFinished: true,
            isActive: false
        });
        return;
    }

    await updateDoc(battleRef, {
        currentTurnIndex: nextIndex,
        currentPlayerId: turnOrder[nextIndex].id,
        turn: data.turn + 1
    });
}

// ============================================================
// 7. КАЛЬКУЛЯТОР АТАКИ (импорт из battle-attack)
// ============================================================
import { calculateAttack, performAttack } from './battle-attack.js';
// ============================================================
// 8. ЛОГ (импорт из battle-log)
// ============================================================
// import { addLog, subscribeToLog } from './battle-log.js';
// ============================================================
// 9. СТАТУСЫ (импорт из battle-status)
// ============================================================
import { applyDamage, addCondition, removeCondition } from './battle-status.js';

// ============================================================
// 10. ЗАВЕРШЕНИЕ БОЯ
// ============================================================
export async function finishBattle(battleId) {
    const battleRef = doc(db, 'battles', battleId);
    await updateDoc(battleRef, {
        isActive: false,
        isFinished: true,
        finishedAt: serverTimestamp()
    });
    await addLog(battleId, {
        time: new Date().toLocaleTimeString(),
        text: '⚔️ БОЙ ЗАВЕРШЁН',
        isSystem: true
    });
}

// ============================================================
// 11. ЭКСПОРТ/ИМПОРТ
// ============================================================
export async function exportBattle(battleId) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) throw new Error('Бой не найден');
    return { id: battleId, ...battleSnap.data() };
}

export async function getBattle(battleId) {
    const battleRef = doc(db, 'battles', battleId);
    const battleSnap = await getDoc(battleRef);
    if (!battleSnap.exists()) throw new Error('Бой не найден');
    return { id: battleId, ...battleSnap.data() };
}

// ============================================================
// 12. СПИСОК АКТИВНЫХ БОЁВ
// ============================================================
export function subscribeToActiveBattles(callback) {
    const q = query(collection(db, 'battles'), where('isActive', '==', true));
    return onSnapshot(q, (snapshot) => {
        const battles = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        callback(battles);
    });
}
// В конце файла battle-core.js
export {
    attemptDefense,
    applyDamageWithDefense,
    resetResources,
    spendOd
};