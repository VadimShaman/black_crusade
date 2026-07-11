#!/bin/bash
# black_crusade.sh — скрипт для быстрого запуска локального сервера

echo "🔥 Black Crusade: Chaos Hub"
echo "Запуск локального сервера на http://localhost:8000"
echo "Нажми Ctrl+C для остановки"

# Запускаем Python HTTP сервер (если есть Python 3)
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer 8000
else
    echo "❌ Python не найден. Установи Python или используй другой сервер."
    exit 1
fi