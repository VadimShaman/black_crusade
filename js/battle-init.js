import { db, collection, onSnapshot, query, orderBy } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('initiative-list');
    if (!list) return;

    const urlParams = new URLSearchParams(window.location.search);
    const battleId = urlParams.get('id');

    if (battleId) {
        const q = query(collection(db, "battles"), orderBy("initiative", "desc"));
        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach((doc) => {
                const data = doc.data();
                html += `<div class="combatant">${data.name || 'Боец'}</div>`;
            });
            list.innerHTML = html;
        });
    }
});