# 🌐 GUIDA: Come Mettere Online il Gioco

## Opzione 1: Rete Locale (WiFi) ✅ FUNZIONA SUBITO
**IP del tuo computer:** `192.168.1.137:3000`

**Come giocare:**
1. Assicurati che il server sia in esecuzione (`npm start`)
2. Tutti i giocatori devono essere sulla **stessa rete WiFi**
3. Condividi questo link: **http://192.168.1.137:3000**
4. Ogni giocatore apre il link sul proprio telefono/computer

## Opzione 2: Servizi Tunnel Pubblici

### A) LocalTunnel (Senza registrazione)
```bash
npm install -g localtunnel
lt --port 3000
```

### B) Serveo (SSH Tunnel)
```bash
ssh -R 80:localhost:3000 serveo.net
```

### C) Cloudflare Tunnel
```bash
npm install -g cloudflared
cloudflared tunnel --url http://localhost:3000
```

## Opzione 3: Deploy su Heroku/Railway (Permanente)

### Railway (Consigliato)
1. Vai su https://railway.app
2. Connetti il repository GitHub
3. Deploy automatico

### Heroku
1. Crea account su heroku.com
2. Installa Heroku CLI
3. Deploy con git

## 🎮 TEST VELOCE - Rete Locale
**Prova subito con WiFi:**
1. Server attivo su http://192.168.1.137:3000
2. Apri il link su più dispositivi
3. Gioca!

## 🔧 Troubleshooting
- **Firewall:** Assicurati che la porta 3000 sia aperta
- **Router:** Alcuni router bloccano connessioni tra dispositivi
- **HTTPS:** Alcuni servizi richiedono HTTPS per funzionalità complete
