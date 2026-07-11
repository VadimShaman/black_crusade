// js/battle/battle-ui.js
// Вспомогательные функции для рендеринга UI
// Основной рендеринг вынесен в battle-init.js

// Форматирование времени
export function formatTime(date) {
    if (!date) return '--:--:--';
    if (typeof date === 'string') return date;
    return date.toLocaleTimeString();
}

// Проверка, жив ли персонаж
export function isAlive(char) {
    return char && char.isActive !== false && char.status !== 'dead';
}

// Получить цвет статуса
export function getStatusColor(status) {
    const colors = {
        alive: '#66aa66',
        critical: '#ff8800',
        dead: '#cc4444'
    };
    return colors[status] || '#887777';
}

// Сокращённое имя для отображения
export function getDisplayName(char) {
    if (!char) return '?';
    let name = char.name || 'Безымянный';
    if (char.playerName) {
        name += ` (${char.playerName})`;
    }
    return name;
}