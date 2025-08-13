#!/bin/bash

# Script per avviare il gioco con ngrok (URL fisso)
echo "🎮 Avvio del server di gioco..."

# Vai nella directory del gioco
cd "/Users/nicola/Visual Studio/Area di Lavoro/GAME"

# Ferma eventuali processi precedenti
echo "🛑 Fermo processi precedenti..."
pkill -f "node server.js" 2>/dev/null
pkill -f "ngrok" 2>/dev/null
pkill -f "ssh.*serveo" 2>/dev/null
sleep 2

# Avvia il server in background
echo "🚀 Avvio server Node.js..."
node server.js &
SERVER_PID=$!

# Aspetta che il server si avvii
sleep 3

# Avvia ngrok per URL fisso
echo "🔗 Avvio ngrok tunnel..."
./ngrok http 3000 &
NGROK_PID=$!

# Aspetta che ngrok si avvii
sleep 5

echo ""
echo "✅ Gioco avviato con successo!"
echo "🌐 URL fisso: Controlla l'output di ngrok sopra"
echo "📱 Condividi il link https://XXXXXX.ngrok-free.app"
echo "🛑 Premi Ctrl+C per fermare tutto"
echo ""

# Aspetta l'interruzione dall'utente
trap "echo '🛑 Fermo tutto...'; kill $SERVER_PID $NGROK_PID 2>/dev/null; exit" SIGINT SIGTERM

# Mantieni lo script in esecuzione
wait
