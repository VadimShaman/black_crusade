import { db } from './firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const battleId = params.get('id');
    const titleEl = document.getElementById('battle-title');

    if (battleId && titleEl) {
        onSnapshot(doc(db, 'battles', battleId), (doc) => {
            if (doc.exists()) {
                titleEl.innerText = `Сражение: ${doc.data().name}`;
            }
        });
    }
});