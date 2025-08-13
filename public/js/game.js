// Main Game Client Logic
class GameClient {
    constructor() {
        console.log('GameClient constructor called');
        
        this.socket = null;
        this.currentScreen = 'login';
        this.playerName = '';
        this.gameState = {};
        this.timer = null;
        this.adminEditor = null;
        
        this.init();
    }
    
    init() {
        try {
            // Initialize Socket.io
            if (typeof io !== 'undefined') {
                this.socket = io();
                console.log('Socket.io initialized');
            } else {
                console.error('Socket.io not loaded');
                return;
            }
            
            this.initializeEventListeners();
            this.setupSocketListeners();
            
            // Initialize admin score editor
            this.adminEditor = new AdminScoreEditor(this);
            window.adminEditor = this.adminEditor; // Make it globally accessible
            
            console.log('GameClient initialized successfully');
        } catch (error) {
            console.error('Error in GameClient init:', error);
        }
    }

    initializeEventListeners() {
        console.log('Setting up event listeners...');
        
        // Login screen
        const joinBtn = document.getElementById('join-btn');
        const playerNameInput = document.getElementById('player-name');
        
        if (joinBtn && playerNameInput) {
            joinBtn.addEventListener('click', () => this.joinGame());
            playerNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.joinGame();
                }
            });
            console.log('Login listeners added');
        }
        
        // Lobby screen
        const readyBtn = document.getElementById('ready-btn');
        if (readyBtn) {
            readyBtn.addEventListener('click', () => this.setReady());
            console.log('Ready button listener added');
        }
        
        // Game screen
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.submitAnswers());
            console.log('Submit button listener added');
        }
        
        // Results screen
        const nextRoundBtn = document.getElementById('next-round-btn');
        if (nextRoundBtn) {
            nextRoundBtn.addEventListener('click', () => this.readyForNextRound());
            console.log('Next round button listener added');
        }
        
        // Final screen
        const newGameBtn = document.getElementById('new-game-btn');
        if (newGameBtn) {
            newGameBtn.addEventListener('click', () => this.startNewGame());
            console.log('New game button listener added');
        }
        
        console.log('Event listeners setup complete');
    }

    setupSocketListeners() {
        console.log('Setting up socket listeners...');
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
        
        this.socket.on('game-state', (state) => {
            console.log('Received game state:', state);
            this.gameState = state;
            this.updateLobby();
        });
        
        this.socket.on('players-ready-status', (data) => {
            console.log('Players ready status:', data);
            this.updateReadyStatus(data.readyPlayers, data.totalPlayers);
        });
        
        this.socket.on('round-started', (data) => {
            console.log('Round started:', data);
            this.startRound(data);
        });
        
        this.socket.on('round-ended', (data) => {
            console.log('Round ended:', data);
            this.showResults(data);
        });
        
        this.socket.on('game-ended', (data) => {
            console.log('Game ended:', data);
            this.showFinalResults(data);
        });
        
        this.socket.on('player-joined', (data) => {
            console.log('Player joined:', data);
            this.updatePlayersList(data.players);
        });
        
        this.socket.on('scores-updated', (data) => {
            console.log('Scores updated by admin:', data);
            this.handleScoresUpdate(data);
        });
        
        this.socket.on('game-full', (data) => {
            console.log('Game is full:', data);
            this.showNotification(data.message, 'error');
            // Optionally, you could also show the current player count
            const countInfo = `Giocatori attuali: ${data.currentPlayers}/${data.maxPlayers}`;
            setTimeout(() => {
                this.showNotification(countInfo, 'info');
            }, 3000);
        });
        
        console.log('Socket listeners setup complete');
    }

    joinGame() {
        const nameInput = document.getElementById('player-name');
        const name = nameInput.value.trim();
        
        if (name.length < 2) {
            this.showNotification('Il nome deve avere almeno 2 caratteri!', 'error');
            return;
        }
        
        if (name.length > 20) {
            this.showNotification('Il nome è troppo lungo (max 20 caratteri)!', 'error');
            return;
        }
        
        this.playerName = name;
        this.socket.emit('join-game', name);
        this.switchScreen('lobby');
    }

    setReady() {
        console.log('setReady() called');
        if (!this.socket) {
            console.error('Socket not initialized!');
            return;
        }
        
        console.log('Emitting set-ready event');
        this.socket.emit('set-ready');
        
        const readyBtn = document.getElementById('ready-btn');
        if (readyBtn) {
            readyBtn.disabled = true;
            readyBtn.textContent = 'PRONTO!';
            console.log('Ready button disabled');
        }
    }

    readyForNextRound() {
        const nextRoundBtn = document.getElementById('next-round-btn');
        
        // Prevent multiple clicks
        if (nextRoundBtn.disabled) {
            console.log('Button already disabled, preventing multiple clicks');
            return;
        }
        
        // Check if we're in the right screen
        if (this.currentScreen !== 'results') {
            console.log('Not in results screen, cannot proceed to next round');
            return;
        }
        
        console.log('Setting player ready for next round');
        this.socket.emit('player-ready');
        
        nextRoundBtn.disabled = true;
        nextRoundBtn.textContent = 'IN ATTESA...';
        nextRoundBtn.style.opacity = '0.6';
        nextRoundBtn.style.cursor = 'not-allowed';
        
        this.showNotification('Pronto per il prossimo round!', 'success');
    }

    submitAnswers() {
        // Check if already submitted
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn.disabled) {
            return;
        }
        
        // Check if we're still in game screen (avoid submitting during transitions)
        if (this.currentScreen !== 'game') {
            console.log('Not in game screen, not submitting answers');
            return;
        }
        
        const answers = {
            Nome: document.getElementById('nome').value.trim(),
            Cognome: document.getElementById('cognome').value.trim(),
            Città: document.getElementById('citta').value.trim(),
            Animale: document.getElementById('animale').value.trim(),
            Cosa: document.getElementById('cosa').value.trim(),
            Mestiere: document.getElementById('mestiere').value.trim(),
            'Personaggi Televisivi': document.getElementById('personaggi-televisivi').value.trim()
        };
        
        // Check if at least one answer is provided
        const hasAnswers = Object.values(answers).some(answer => answer.length > 0);
        if (!hasAnswers) {
            this.showNotification('Inserisci almeno una risposta!', 'error');
            return;
        }
        
        // Validate answers length
        for (const [category, answer] of Object.entries(answers)) {
            if (answer.length > 50) {
                this.showNotification(`La risposta per ${category} è troppo lunga (max 50 caratteri)!`, 'error');
                return;
            }
            
            // Remove potentially problematic characters
            answers[category] = answer.replace(/[<>"'&]/g, '');
        }
        
        console.log('Submitting answers:', answers);
        this.socket.emit('submit-answers', answers);
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'INVIATE!';
        
        // Disable all input fields
        const inputs = document.querySelectorAll('#game-screen input[type="text"]');
        inputs.forEach(input => input.disabled = true);
        
        this.showNotification('Risposte inviate!', 'success');
    }

    startRound(data) {
        // Show countdown first
        this.showCountdown(data);
    }

    showCountdown(data) {
        this.switchScreen('countdown');
        
        // Update countdown info
        document.getElementById('countdown-round').textContent = data.round;
        document.getElementById('countdown-letter').textContent = data.letter;
        
        let countdown = 3;
        const countdownElement = document.getElementById('countdown-number');
        
        const countdownInterval = setInterval(() => {
            countdownElement.textContent = countdown;
            countdownElement.style.animation = 'none';
            
            // Trigger reflow to restart animation
            countdownElement.offsetHeight;
            countdownElement.style.animation = 'countdownPulse 1s ease-in-out';
            
            countdown--;
            
            if (countdown < 0) {
                clearInterval(countdownInterval);
                this.startGameRound(data);
            }
        }, 1000);
    }

    startGameRound(data) {
        this.switchScreen('game');
        
        // Update round info
        document.getElementById('current-round').textContent = data.round;
        document.getElementById('current-letter').textContent = data.letter;
        
        // Clear previous answers and update placeholders
        const inputs = document.querySelectorAll('#game-screen input[type="text"]');
        inputs.forEach(input => {
            input.value = '';
            input.disabled = false;
            
            // Create appropriate placeholder based on input ID
            let category = '';
            switch(input.id) {
                case 'nome':
                    category = 'Nome';
                    break;
                case 'cognome':
                    category = 'Cognome';
                    break;
                case 'citta':
                    category = 'Città';
                    break;
                case 'animale':
                    category = 'Animale';
                    break;
                case 'cosa':
                    category = 'Cosa';
                    break;
                case 'mestiere':
                    category = 'Mestiere';
                    break;
                case 'personaggi-televisivi':
                    category = 'Personaggi TV';
                    break;
            }
            
            input.placeholder = `${category} che inizia per ${data.letter}...`;
        });
        
        // Reset submit button
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.disabled = false;
        submitBtn.textContent = 'INVIA RISPOSTE';
        
        // Start timer
        this.startTimer(data.duration);
    }

    startTimer(duration) {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        let timeLeft = duration;
        const timerElement = document.getElementById('time-remaining');
        
        // Update immediately
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        this.timer = setInterval(() => {
            timeLeft -= 1000;
            
            if (timeLeft < 0) {
                timeLeft = 0;
            }
            
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            
            timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            timerElement.style.color = '#00ff88'; // Reset color
            
            // Warning colors
            if (timeLeft <= 30000) {
                timerElement.style.color = '#ff6600';
            } else if (timeLeft <= 60000) {
                timerElement.style.color = '#ffff00';
            }
            
            if (timeLeft <= 0) {
                clearInterval(this.timer);
                this.timer = null;
                
                // Only auto-submit if not already submitted
                const submitBtn = document.getElementById('submit-btn');
                if (!submitBtn.disabled) {
                    console.log('Time expired, auto-submitting answers');
                    this.submitAnswers();
                }
            }
        }, 1000);
    }

    showResults(data) {
        this.switchScreen('results');
        
        console.log('Show results data:', data); // Debug log
        
        // Display answers comparison
        this.displayAnswersComparison(data.answers, data.players);
        
        // Display scores
        this.displayScores(data.roundScores, data.totalScores, data.players);
        
        // Show admin score editor banner
        if (this.adminEditor) {
            this.adminEditor.show(data.roundScores, data.totalScores, data.players);
        }
        
        // Check if this is the last round
        const isLastRound = data.round >= data.maxRounds;
        const nextRoundBtn = document.getElementById('next-round-btn');
        
        if (isLastRound) {
            // Hide the next round button if it's the last round
            nextRoundBtn.style.display = 'none';
            
            // Show message that results are being calculated
            const nextRoundSection = nextRoundBtn.parentElement;
            if (nextRoundSection) {
                const finalMessage = document.createElement('div');
                finalMessage.className = 'final-message';
                finalMessage.innerHTML = '<h3>Partita completata! Calcolando i risultati finali...</h3>';
                finalMessage.style.textAlign = 'center';
                finalMessage.style.color = 'var(--accent-green)';
                finalMessage.style.marginTop = '20px';
                nextRoundSection.appendChild(finalMessage);
            }
        } else {
            // Reset next round button for non-final rounds
            nextRoundBtn.style.display = 'block';
            nextRoundBtn.disabled = false;
            nextRoundBtn.textContent = 'PROSSIMO ROUND';
            nextRoundBtn.style.opacity = '1';
            
            // Reset ready counter
            const readyCountElement = document.getElementById('ready-count');
            if (readyCountElement) {
                readyCountElement.textContent = '0/' + Object.keys(data.players).length;
                readyCountElement.style.color = 'var(--accent-orange)';
            }
        }
        
        // Clear any existing timer
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    displayAnswersComparison(allAnswers, players) {
        const container = document.getElementById('answers-comparison');
        const categories = ['Nome', 'Cognome', 'Città', 'Animale', 'Cosa', 'Mestiere', 'Personaggi Televisivi'];
        const currentLetter = document.getElementById('current-letter').textContent;
        
        container.innerHTML = '<h3>Risposte del Round</h3>';
        
        categories.forEach(category => {
            const row = document.createElement('div');
            row.className = 'answer-row';
            
            const label = document.createElement('div');
            label.className = 'category-label';
            label.textContent = category;
            
            const answersList = document.createElement('div');
            answersList.className = 'answers-list';
            
            Object.keys(allAnswers).forEach(socketId => {
                const answer = allAnswers[socketId][category] || '';
                const playerName = (players[socketId] && players[socketId].name) || 'Giocatore Sconosciuto';
                
                if (answer.trim() !== '') {
                    const answerItem = document.createElement('div');
                    answerItem.className = 'answer-item';
                    
                    // Check if answer starts with correct letter
                    const isCorrect = answer.charAt(0).toUpperCase() === currentLetter;
                    answerItem.classList.add(isCorrect ? 'correct' : 'incorrect');
                    
                    answerItem.innerHTML = `
                        <span class="player-name" style="color: var(--accent-green); font-weight: bold;">${playerName}:</span>
                        <span class="answer" style="color: var(--text-light);">${answer}</span>
                    `;
                    
                    answersList.appendChild(answerItem);
                }
            });
            
            row.appendChild(label);
            row.appendChild(answersList);
            container.appendChild(row);
        });
    }

    displayScores(roundScores, totalScores, players) {
        const container = document.getElementById('scores-display');
        container.innerHTML = '<h3>Punteggi</h3>';
        
        // Sort players by total score
        const sortedPlayers = Object.keys(totalScores).sort((a, b) => totalScores[b] - totalScores[a]);
        
        sortedPlayers.forEach((socketId, index) => {
            const scoreItem = document.createElement('div');
            scoreItem.className = `score-item ${index === 0 ? 'leader' : ''}`;
            
            const playerName = document.createElement('div');
            playerName.className = 'player-name';
            playerName.style.color = 'var(--text-light)';
            playerName.style.fontWeight = 'bold';
            const name = (players[socketId] && players[socketId].name) || 'Giocatore Sconosciuto';
            playerName.textContent = `${index + 1}. ${name}`;
            
            const scoreValue = document.createElement('div');
            scoreValue.className = 'score-value';
            scoreValue.textContent = `${totalScores[socketId]} (+${roundScores[socketId] || 0})`;
            
            scoreItem.appendChild(playerName);
            scoreItem.appendChild(scoreValue);
            container.appendChild(scoreItem);
        });
    }

    showFinalResults(data) {
        this.switchScreen('final');
        
        // Winner announcement - handle ties
        const winnerContainer = document.getElementById('winner-announcement');
        
        if (data.isTie && data.winners.length > 1) {
            // Multiple winners (tie)
            const winnerNames = data.winners.map(winner => winner.name).join(' e ');
            const hasNicola = data.winners.some(winner => winner.name.toLowerCase().includes('nicola'));
            
            winnerContainer.innerHTML = `
                <div class="winner-crown">🏆</div>
                <div class="winner-title">PAREGGIO!</div>
                <div class="winner-name">${winnerNames}</div>
                <div class="winner-message">
                    Parità con ${data.maxScore} punti! ${hasNicola ? 'Nicola offre birre a tutti!' : 'Offrite tutti una birra a Nicola!'}
                </div>
            `;
        } else {
            // Single winner
            const winner = data.winners[0];
            const isNicola = winner.name.toLowerCase().includes('nicola');
            
            winnerContainer.innerHTML = `
                <div class="winner-crown">🏆</div>
                <div class="winner-title">VINCITORE!</div>
                <div class="winner-name">${winner.name}</div>
                <div class="winner-message">
                    ${isNicola ? 
                        'HAI VINTO TU! Ora offri una birra a Nicola!' : 
                        'Congratulazioni per la vittoria! Ora offri una birra a Nicola!'
                    }
                </div>
            `;
        }
        
        // Final scores
        this.displayFinalScores(data.finalScores, data.players);
    }

    displayFinalScores(scores, players) {
        const container = document.getElementById('final-scores');
        container.innerHTML = '<h3>Classifica Finale</h3>';
        
        const sortedPlayers = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
        
        sortedPlayers.forEach((socketId, index) => {
            const scoreItem = document.createElement('div');
            scoreItem.className = `score-item ${index === 0 ? 'leader' : ''}`;
            
            const playerName = document.createElement('div');
            playerName.className = 'player-name';
            playerName.style.color = 'var(--text-light)';
            playerName.style.fontWeight = 'bold';
            const name = (players[socketId] && players[socketId].name) || 'Giocatore Sconosciuto';
            playerName.textContent = `${index + 1}. ${name}`;
            
            const scoreValue = document.createElement('div');
            scoreValue.className = 'score-value';
            scoreValue.textContent = scores[socketId];
            
            scoreItem.appendChild(playerName);
            scoreItem.appendChild(scoreValue);
            container.appendChild(scoreItem);
        });
    }

    updateLobby() {
        console.log('Updating lobby with gameState:', this.gameState);
        if (this.gameState && this.gameState.players) {
            this.updatePlayersList(this.gameState.players);
        }
    }

    updatePlayersList(players) {
        console.log('Updating players list:', players);
        const container = document.getElementById('players-container');
        if (!container) {
            console.error('Players container not found!');
            return;
        }
        
        container.innerHTML = '';
        
        // Handle both array and object formats
        const playersArray = Array.isArray(players) ? players : Object.values(players);
        
        playersArray.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = `player-badge ${player.ready ? 'ready' : ''}`;
            const name = player.name || 'Giocatore Sconosciuto';
            playerElement.textContent = `${name} ${player.ready ? '✅' : '⏳'}`;
            container.appendChild(playerElement);
        });
        
        // Update player count display
        const playerCountElement = document.getElementById('player-count');
        if (playerCountElement) {
            playerCountElement.textContent = `${playersArray.length}/10`;
        }
        
        console.log('Players list updated with', playersArray.length, 'players');
    }

    updateReadyStatus(readyCount, totalCount) {
        console.log(`Ready status update: ${readyCount}/${totalCount}`);
        
        // Update lobby ready status
        const statusElement = document.getElementById('ready-status');
        if (statusElement) {
            statusElement.textContent = `${readyCount}/${totalCount} giocatori pronti`;
            
            if (readyCount === totalCount && totalCount >= 2) {
                statusElement.textContent = 'Iniziando la partita...';
                console.log('Game should start now!');
            }
        }
        
        // Update results screen ready counter (if exists)
        const readyCountElement = document.getElementById('ready-count');
        if (readyCountElement) {
            readyCountElement.textContent = `${readyCount}/${totalCount}`;
            
            // Change color based on readiness
            if (readyCount === totalCount && totalCount >= 2) {
                readyCountElement.style.color = 'var(--accent-green)';
                readyCountElement.textContent = `${readyCount}/${totalCount} - Iniziando...`;
            } else {
                readyCountElement.style.color = 'var(--accent-orange)';
            }
        }
    }

    switchScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show target screen
        document.getElementById(`${screenName}-screen`).classList.add('active');
        this.currentScreen = screenName;
        
        // Hide admin banner when not on results screen
        if (this.adminEditor && screenName !== 'results') {
            this.adminEditor.hide();
        }
    }

    startNewGame() {
        location.reload();
    }
    
    handleScoresUpdate(data) {
        console.log('Handling scores update:', data);
        
        // Update the scores display if we're on the results screen
        if (this.currentScreen === 'results') {
            const scoresDisplay = document.getElementById('scores-display');
            if (scoresDisplay) {
                // Clear existing scores
                scoresDisplay.innerHTML = '<h3>PUNTEGGI AGGIORNATI</h3>';
                
                // Create scores array for sorting
                const sortedScores = Object.entries(data.totalScores)
                    .map(([name, score]) => ({ name, score }))
                    .sort((a, b) => b.score - a.score);
                
                // Display updated scores
                sortedScores.forEach((player, index) => {
                    const scoreDiv = document.createElement('div');
                    scoreDiv.className = 'score-item';
                    if (index === 0) scoreDiv.classList.add('leader');
                    
                    scoreDiv.innerHTML = `
                        <span class="player-name">${player.name}</span>
                        <span class="score-value">${player.score}</span>
                    `;
                    scoresDisplay.appendChild(scoreDiv);
                });
            }
        }
        
        // Show notification
        if (data.message) {
            this.showNotification(data.message, 'success');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease-out;
            ${type === 'error' ? 'background: linear-gradient(135deg, #ff4757, #ff3838);' : ''}
            ${type === 'success' ? 'background: linear-gradient(135deg, #2ed573, #1dd1a1);' : ''}
            ${type === 'info' ? 'background: linear-gradient(135deg, #3742fa, #2f3542);' : ''}
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 3000);
    }
}

// Admin Score Editor Class
class AdminScoreEditor {
    constructor(gameClient) {
        this.gameClient = gameClient;
        this.isOpen = false;
        this.currentRoundScores = {};
        this.originalScores = {};
        this.playersInfo = {}; // Store player ID -> name mapping
        
        this.initializeElements();
        this.setupEventListeners();
    }
    
    initializeElements() {
        this.banner = document.getElementById('admin-banner');
        this.modal = document.getElementById('admin-modal');
        this.closeBtn = document.getElementById('admin-close-btn');
        this.saveBtn = document.getElementById('admin-save-btn');
        this.playersList = document.getElementById('admin-players-list');
    }
    
    setupEventListeners() {
        if (this.banner) {
            this.banner.addEventListener('click', () => this.openModal());
        }
        
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.closeModal());
        }
        
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.closeModal();
                }
            });
        }
        
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.saveChanges());
        }
    }
    
    show(roundScores, totalScores, playersData) {
        console.log('Admin panel showing with scores:', roundScores, totalScores, playersData);
        this.currentRoundScores = { ...roundScores };
        this.originalScores = { ...roundScores };
        this.totalScores = { ...totalScores };
        
        // Update players info mapping if provided
        if (playersData) {
            this.playersInfo = {};
            if (Array.isArray(playersData)) {
                playersData.forEach(player => {
                    if (player.id && player.name) {
                        this.playersInfo[player.id] = player.name;
                    }
                });
            } else if (typeof playersData === 'object') {
                Object.entries(playersData).forEach(([id, player]) => {
                    if (player.name) {
                        this.playersInfo[id] = player.name;
                    }
                });
            }
        }
        
        if (this.banner) {
            this.banner.classList.add('active');
        }
    }
    
    hide() {
        console.log('Admin panel hiding');
        if (this.banner) {
            this.banner.classList.remove('active');
        }
        this.closeModal();
    }
    
    openModal() {
        console.log('Opening admin modal');
        this.isOpen = true;
        this.renderPlayersList();
        
        if (this.modal) {
            this.modal.classList.add('active');
        }
    }
    
    closeModal() {
        console.log('Closing admin modal');
        this.isOpen = false;
        
        if (this.modal) {
            this.modal.classList.remove('active');
        }
    }
    
    renderPlayersList() {
        if (!this.playersList) return;
        
        console.log('Rendering players list:');
        console.log('- currentRoundScores:', this.currentRoundScores);
        console.log('- playersInfo:', this.playersInfo);
        console.log('- gameClient.gameState:', this.gameClient?.gameState);
        
        this.playersList.innerHTML = '';
        
        Object.keys(this.currentRoundScores).forEach(playerId => {
            // Get the actual player name from gameState
            const playerName = this.getPlayerNameById(playerId);
            
            console.log(`Player ID: ${playerId} -> Name: ${playerName}`);
            
            const playerDiv = document.createElement('div');
            playerDiv.className = 'admin-player-item';
            
            const currentScore = this.currentRoundScores[playerId] || 0;
            const totalScore = this.totalScores[playerId] || 0;
            
            playerDiv.innerHTML = `
                <div class="admin-player-info">
                    <div class="admin-player-name">${playerName}</div>
                    <div class="admin-player-round-score">Punteggio round: ${currentScore} | Totale: ${totalScore}</div>
                </div>
                <div class="admin-score-controls">
                    <input type="number" 
                           class="admin-score-input" 
                           value="${currentScore}" 
                           data-player="${playerId}"
                           min="0" 
                           max="70"
                           step="1">
                    <button class="admin-btn" onclick="window.adminEditor.setScore('${playerId}', 0)">
                        Reset
                    </button>
                    <button class="admin-btn danger" onclick="window.adminEditor.adjustScore('${playerId}', -5)">
                        -5
                    </button>
                    <button class="admin-btn" onclick="window.adminEditor.adjustScore('${playerId}', 5)">
                        +5
                    </button>
                </div>
            `;
            
            this.playersList.appendChild(playerDiv);
            
            // Add event listener to input
            const input = playerDiv.querySelector('.admin-score-input');
            input.addEventListener('input', (e) => {
                const newScore = parseInt(e.target.value) || 0;
                this.setScore(playerId, newScore);
            });
        });
    }
    
    getPlayerNameById(playerId) {
        // First check our local players info mapping
        if (this.playersInfo[playerId]) {
            return this.playersInfo[playerId];
        }
        
        // Check if gameClient has the gameState with players info
        if (this.gameClient && this.gameClient.gameState && this.gameClient.gameState.players) {
            const players = this.gameClient.gameState.players;
            const player = Array.isArray(players) 
                ? players.find(p => p.id === playerId)
                : players[playerId];
            
            if (player && player.name) {
                // Cache the name for future use
                this.playersInfo[playerId] = player.name;
                return player.name;
            }
        }
        
        // Additional fallback: check if this is the current player
        if (this.gameClient && this.gameClient.socket && this.gameClient.socket.id === playerId) {
            if (this.gameClient.playerName) {
                this.playersInfo[playerId] = this.gameClient.playerName;
                return this.gameClient.playerName;
            }
        }
        
        // Final fallback: return a user-friendly shortened version
        const shortId = playerId.substring(0, 6);
        return `Giocatore ${shortId}`;
    }
    
    setScore(playerId, newScore) {
        console.log(`Setting score for ${playerId} to ${newScore}`);
        this.currentRoundScores[playerId] = Math.max(0, Math.min(70, newScore));
        
        // Update the input if it was changed programmatically
        const input = document.querySelector(`[data-player="${playerId}"]`);
        if (input && parseInt(input.value) !== this.currentRoundScores[playerId]) {
            input.value = this.currentRoundScores[playerId];
        }
        
        this.updateTotalDisplay(playerId);
    }
    
    adjustScore(playerId, adjustment) {
        const currentScore = this.currentRoundScores[playerId] || 0;
        this.setScore(playerId, currentScore + adjustment);
        this.renderPlayersList();
    }
    
    updateTotalDisplay(playerId) {
        const playerDiv = document.querySelector(`[data-player="${playerId}"]`)?.closest('.admin-player-item');
        if (playerDiv) {
            const originalRoundScore = this.originalScores[playerId] || 0;
            const newRoundScore = this.currentRoundScores[playerId] || 0;
            const scoreDifference = newRoundScore - originalRoundScore;
            const newTotal = (this.totalScores[playerId] || 0) + scoreDifference;
            
            const roundScoreDiv = playerDiv.querySelector('.admin-player-round-score');
            if (roundScoreDiv) {
                roundScoreDiv.textContent = `Punteggio round: ${newRoundScore} | Totale: ${newTotal}`;
            }
        }
    }
    
    saveChanges() {
        console.log('Saving score changes...');
        
        const changes = {};
        let hasChanges = false;
        
        Object.keys(this.currentRoundScores).forEach(playerId => {
            const originalScore = this.originalScores[playerId] || 0;
            const newScore = this.currentRoundScores[playerId] || 0;
            
            if (originalScore !== newScore) {
                changes[playerId] = {
                    oldScore: originalScore,
                    newScore: newScore,
                    difference: newScore - originalScore
                };
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            console.log('Sending score changes to server:', changes);
            this.gameClient.socket.emit('admin-score-update', changes);
            
            // Show confirmation
            this.showNotification('Punteggi aggiornati!', 'success');
        } else {
            this.showNotification('Nessuna modifica da salvare', 'info');
        }
        
        this.closeModal();
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? 'var(--accent-green)' : 'var(--primary-cyan)'};
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            z-index: 1002;
            font-weight: 600;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            animation: slideInTop 0.3s ease-out;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutTop 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 2000);
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing game...');
    
    try {
        window.gameClient = new GameClient();
        console.log('Game initialized successfully');
    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
});

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes slideInTop {
        from { transform: translate(-50%, -100%); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    }
    
    @keyframes slideOutTop {
        from { transform: translate(-50%, 0); opacity: 1; }
        to { transform: translate(-50%, -100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
console.log('Auto-deploy test - Mer 13 Ago 2025 18:41:50 CEST');
