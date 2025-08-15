// Main Game Client Logic
class GameClient {
    constructor() {
        console.log('GameClient constructor called');
        
        this.socket = null;
        this.currentScreen = 'login';
        this.playerName = '';
        this.gameState = {};
        this.timer = null;
        this.countdownTimer = null; // Separate timer for countdown
        this.autoSaveInterval = null; // Timer for auto-saving answers
        this.adminEditor = null;
        this.connectionAttempts = 0; // Track connection attempts
        this.isMobile = this.detectMobile(); // Detect mobile device
        
        // Cache DOM elements
        this.cachedElements = {};
        
        console.log('Mobile device detected:', this.isMobile);
    }
    
    detectMobile() {
        // Multiple methods to detect mobile devices
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.innerWidth <= 768;
        
        return isMobileUA || (isTouchDevice && isSmallScreen);
    }
    
    initializeApp() {
        try {
            // Verify essential DOM elements exist
            if (!this.verifyDOM()) {
                console.error('Essential DOM elements missing, cannot initialize');
                this.showNotification('Errore di caricamento dell\'applicazione', 'error');
                return;
            }
            
            // Initialize Socket.io
            if (typeof io !== 'undefined') {
                this.socket = io();
                console.log('Socket.io initialized');
            } else {
                console.error('Socket.io not loaded');
                this.showNotification('Socket.io non disponibile', 'error');
                return;
            }
            
            this.initializeEventListeners();
            this.setupSocketListeners();
            
            // Initialize admin score editor
            this.adminEditor = new AdminScoreEditor(this);
            window.adminEditor = this.adminEditor; // Make it globally accessible
            
            console.log('GameClient initialized successfully');
        } catch (error) {
            console.error('Error in GameClient initializeApp:', error);
            this.showNotification('Errore durante l\'inizializzazione', 'error');
        }
    }
    
    verifyDOM() {
        const essentialElements = [
            'login-screen',
            'lobby-screen', 
            'countdown-screen',
            'game-screen',
            'results-screen',
            'final-screen',
            'player-name',
            'join-btn',
            'ready-btn',
            'submit-btn',
            'next-round-btn'
        ];
        
        const missingElements = [];
        
        essentialElements.forEach(id => {
            if (!document.getElementById(id)) {
                missingElements.push(id);
            }
        });
        
        if (missingElements.length > 0) {
            console.error('Missing DOM elements:', missingElements);
            return false;
        }
        
        return true;
    }

    initializeEventListeners() {
        try {
            console.log('Initializing event listeners...');
            
            // Wait a bit to ensure DOM is ready
            setTimeout(() => {
                // Remove existing event listeners first to prevent duplicates
                this.removeEventListeners();
                
                // Store bound methods for proper cleanup
                this.boundHandlers = {
                    joinGame: this.joinGame.bind(this),
                    readyUp: this.setReady.bind(this),
                    submitAnswers: this.submitAnswers.bind(this),
                    nextRound: this.readyForNextRound.bind(this)
                };
                
                // Create mobile-friendly touch handler
                this.boundHandlers.touchHandler = (e) => {
                    e.preventDefault(); // Prevent default touch behavior
                    e.stopPropagation();
                    
                    // Find which handler to call based on target
                    const target = e.target.closest('button');
                    if (!target) return;
                    
                    if (target.id === 'join-btn') {
                        this.boundHandlers.joinGame();
                    } else if (target.id === 'ready-btn') {
                        this.boundHandlers.readyUp();
                    } else if (target.id === 'submit-btn') {
                        this.boundHandlers.submitAnswers();
                    } else if (target.id === 'next-round-btn') {
                        this.boundHandlers.nextRound();
                    }
                };
                
                // Join game
                const joinBtn = document.getElementById('join-btn');
                console.log('Join button found:', joinBtn);
                if (joinBtn) {
                    // Always add click event
                    joinBtn.addEventListener('click', this.boundHandlers.joinGame);
                    
                    // Add touch events only on mobile devices
                    if (this.isMobile) {
                        joinBtn.addEventListener('touchstart', this.boundHandlers.touchHandler, { passive: false });
                        console.log('Join button event listeners added (click and touch for mobile)');
                    } else {
                        console.log('Join button event listener added (click only for desktop)');
                    }
                } else {
                    console.error('Join button not found!');
                }
                
                // Ready up
                const readyBtn = document.getElementById('ready-btn');
                if (readyBtn) {
                    readyBtn.addEventListener('click', this.boundHandlers.readyUp);
                    if (this.isMobile) {
                        readyBtn.addEventListener('touchstart', this.boundHandlers.touchHandler, { passive: false });
                    }
                }
                
                // Submit answers
                const submitBtn = document.getElementById('submit-btn');
                if (submitBtn) {
                    submitBtn.addEventListener('click', this.boundHandlers.submitAnswers);
                    if (this.isMobile) {
                        submitBtn.addEventListener('touchstart', this.boundHandlers.touchHandler, { passive: false });
                    }
                }
                
                // Next round
                const nextRoundBtn = document.getElementById('next-round-btn');
                if (nextRoundBtn) {
                    nextRoundBtn.addEventListener('click', this.boundHandlers.nextRound);
                    if (this.isMobile) {
                        nextRoundBtn.addEventListener('touchstart', this.boundHandlers.touchHandler, { passive: false });
                    }
                }
                
                // Enter key for player name
                const playerNameInput = document.getElementById('player-name');
                if (playerNameInput) {
                    this.boundHandlers.playerNameEnter = (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.boundHandlers.joinGame();
                        }
                    };
                    playerNameInput.addEventListener('keypress', this.boundHandlers.playerNameEnter);
                }
                
            }, 200); // Increased timeout for better DOM readiness
            
        } catch (error) {
            console.error('Error initializing event listeners:', error);
        }
    }

    removeEventListeners() {
        try {
            if (!this.boundHandlers) return;
            
            const joinBtn = document.getElementById('join-btn');
            if (joinBtn && this.boundHandlers.joinGame) {
                joinBtn.removeEventListener('click', this.boundHandlers.joinGame);
                if (this.isMobile && this.boundHandlers.touchHandler) {
                    joinBtn.removeEventListener('touchstart', this.boundHandlers.touchHandler);
                }
            }
            
            const readyBtn = document.getElementById('ready-btn');
            if (readyBtn && this.boundHandlers.readyUp) {
                readyBtn.removeEventListener('click', this.boundHandlers.readyUp);
                if (this.isMobile && this.boundHandlers.touchHandler) {
                    readyBtn.removeEventListener('touchstart', this.boundHandlers.touchHandler);
                }
            }
            
            const submitBtn = document.getElementById('submit-btn');
            if (submitBtn && this.boundHandlers.submitAnswers) {
                submitBtn.removeEventListener('click', this.boundHandlers.submitAnswers);
                if (this.isMobile && this.boundHandlers.touchHandler) {
                    submitBtn.removeEventListener('touchstart', this.boundHandlers.touchHandler);
                }
            }
            
            const nextRoundBtn = document.getElementById('next-round-btn');
            if (nextRoundBtn && this.boundHandlers.nextRound) {
                nextRoundBtn.removeEventListener('click', this.boundHandlers.nextRound);
                if (this.isMobile && this.boundHandlers.touchHandler) {
                    nextRoundBtn.removeEventListener('touchstart', this.boundHandlers.touchHandler);
                }
            }
            
            const playerNameInput = document.getElementById('player-name');
            if (playerNameInput && this.boundHandlers.playerNameEnter) {
                playerNameInput.removeEventListener('keypress', this.boundHandlers.playerNameEnter);
            }
            
        } catch (error) {
            console.error('Error removing event listeners:', error);
        }
    }

    setupSocketListeners() {
        console.log('Setting up socket listeners...');
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.connectionAttempts = 0; // Reset connection attempts on successful connect
            
            // Hide any connection error notifications
            const existingErrors = document.querySelectorAll('.notification.error');
            existingErrors.forEach(error => {
                if (error.textContent.includes('connessione')) {
                    error.remove();
                }
            });
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.cleanupTimers(); // Clean up all timers on disconnect
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.connectionAttempts++;
            
            // Only show error after multiple failed attempts to avoid false alarms
            if (this.connectionAttempts > 2) {
                this.showNotification('Problema di connessione al server. Tentativo di riconnessione...', 'error');
            }
        });
        
        this.socket.on('reconnect', () => {
            console.log('Reconnected to server');
            this.connectionAttempts = 0;
            this.showNotification('Connessione ripristinata!', 'success');
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showNotification('Errore di comunicazione', 'error');
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
            console.log('Round ended by server:', data);
            
            // Clear any remaining timer and auto-save
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            if (this.autoSaveInterval) {
                clearInterval(this.autoSaveInterval);
                this.autoSaveInterval = null;
            }
            
            // If round ended but we haven't submitted yet, it means server auto-submitted for us
            const submitBtn = document.getElementById('submit-btn');
            if (submitBtn && !submitBtn.disabled && this.currentScreen === 'game') {
                console.log('Server auto-submitted our answers');
                submitBtn.textContent = 'AUTO-INVIATE DAL SERVER';
                submitBtn.style.backgroundColor = '#ff6600';
                submitBtn.disabled = true;
                this.showNotification('Il server ha inviato automaticamente le tue risposte!', 'warning');
            }
            
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
        
        this.socket.on('join-error', (data) => {
            console.log('Join error:', data);
            this.showNotification(data.message, 'error');
        });
        
        console.log('Socket listeners setup complete');
    }

    joinGame() {
        console.log('joinGame function called!');
        const nameInput = document.getElementById('player-name');
        if (!nameInput) {
            this.showNotification('Errore: campo nome non trovato', 'error');
            return;
        }
        
        const name = nameInput.value.trim();
        
        // Enhanced validation
        if (name.length < 2) {
            this.showNotification('Il nome deve avere almeno 2 caratteri!', 'error');
            nameInput.focus();
            return;
        }
        
        if (name.length > 20) {
            this.showNotification('Il nome è troppo lungo (max 20 caratteri)!', 'error');
            nameInput.focus();
            return;
        }
        
        // Check for invalid characters
        if (!/^[a-zA-Z0-9\s\u00C0-\u017F]+$/.test(name)) {
            this.showNotification('Il nome contiene caratteri non validi!', 'error');
            nameInput.focus();
            return;
        }
        
        // Check socket connection
        if (!this.socket || !this.socket.connected) {
            this.showNotification('Connessione al server non disponibile. Riprova...', 'error');
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
        
        const readyBtn = document.getElementById('ready-btn');
        
        // Prevent multiple ready clicks
        if (readyBtn && readyBtn.disabled) {
            console.log('Ready button already disabled, preventing double ready');
            return;
        }
        
        console.log('Emitting set-ready event');
        this.socket.emit('set-ready');
        
        if (readyBtn) {
            readyBtn.disabled = true;
            readyBtn.textContent = 'PRONTO!';
            readyBtn.style.opacity = '0.6';
            readyBtn.style.cursor = 'not-allowed';
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

    cleanupTimers() {
        // Clean up all timers to prevent memory leaks
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        
        console.log('All timers cleaned up');
    }

    // Utility method to safely get cached DOM elements
    getElement(id) {
        // Always get fresh element reference for initial setup
        const element = document.getElementById(id);
        if (element) {
            this.cachedElements[id] = element;
        }
        return element;
    }
    
    // Safe DOM element getter with error handling
    safeGetElement(id, operation = 'operation') {
        const element = this.getElement(id);
        if (!element) {
            console.error(`Element with id '${id}' not found for ${operation}`);
            return null;
        }
        return element;
    }

    submitAnswers() {
        // Check if already submitted
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn.disabled) {
            console.log('Submit button already disabled, preventing double submission');
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
        this.showNotification('Risposte inviate!', 'success');
        
        // Disable all input fields
        const inputs = document.querySelectorAll('#game-screen input[type="text"]');
        inputs.forEach(input => input.disabled = true);
        
        // Clear auto-save interval since round is over
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }
    
    // Send current answers to server for auto-save (background operation)
    sendCurrentAnswersToServer() {
        const answers = {
            'Nome': document.getElementById('nome').value.trim(),
            'Cognome': document.getElementById('cognome').value.trim(),
            'Città': document.getElementById('citta').value.trim(),
            'Animale': document.getElementById('animale').value.trim(),
            'Cosa': document.getElementById('cosa').value.trim(),
            'Mestiere': document.getElementById('mestiere').value.trim(),
            'Personaggi Televisivi': document.getElementById('personaggi-televisivi').value.trim()
        };
        
        // Clean and validate answers
        for (const [category, answer] of Object.entries(answers)) {
            if (answer.length > 50) {
                answers[category] = answer.substring(0, 50);
            }
            answers[category] = answer.replace(/[<>"'&]/g, '');
        }
        
        // Send to server as backup (won't count as official submission)
        this.socket.emit('update-answers', answers);
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
                this.countdownTimer = null; // Clear reference
                this.startGameRound(data);
            }
        }, 1000);
        
        this.countdownTimer = countdownInterval; // Store reference for cleanup
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
        submitBtn.style.backgroundColor = ''; // Reset color
        
        // Set up auto-save of answers every 5 seconds
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        this.autoSaveInterval = setInterval(() => {
            if (this.currentScreen === 'game') {
                this.sendCurrentAnswersToServer();
            }
        }, 5000); // Every 5 seconds
        
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
                
                // Don't auto-submit on client side - let server handle it
                console.log('Time expired on client side - waiting for server to end round');
                
                // Just show visual feedback that time is up
                const submitBtn = document.getElementById('submit-btn');
                if (submitBtn && this.currentScreen === 'game') {
                    submitBtn.textContent = 'TEMPO SCADUTO!';
                    submitBtn.style.backgroundColor = '#ff6600';
                    submitBtn.disabled = true; // Disable to prevent manual submission after time
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
        
        // Clear countdown timer if exists
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
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
        container.innerHTML = '';
        
        // Create title section
        const titleSection = document.createElement('div');
        titleSection.className = 'final-rankings-title';
        titleSection.innerHTML = `
            <h3>🏆 CLASSIFICA FINALE 🏆</h3>
            <div class="rankings-subtitle">Punteggi totali dopo 10 round</div>
        `;
        container.appendChild(titleSection);
        
        // Create rankings container
        const rankingsContainer = document.createElement('div');
        rankingsContainer.className = 'final-rankings-container';
        
        const sortedPlayers = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
        
        sortedPlayers.forEach((socketId, index) => {
            const playerScore = scores[socketId] || 0;
            const playerData = (players[socketId] && players[socketId].name) ? players[socketId] : null;
            const playerName = playerData ? playerData.name : `Giocatore ${socketId.substring(0, 6)}`;
            
            const rankItem = document.createElement('div');
            rankItem.className = `final-rank-item ${index === 0 ? 'champion' : ''} ${index <= 2 ? 'podium' : ''}`;
            
            // Medal/Position icon
            let positionIcon = '';
            if (index === 0) positionIcon = '🥇';
            else if (index === 1) positionIcon = '🥈';
            else if (index === 2) positionIcon = '🥉';
            else positionIcon = `#${index + 1}`;
            
            // Score performance indicator
            let performance = '';
            if (playerScore >= 300) performance = '🔥 INCREDIBILE!';
            else if (playerScore >= 200) performance = '⭐ OTTIMO!';
            else if (playerScore >= 100) performance = '👍 BUONO';
            else if (playerScore >= 50) performance = '📈 DISCRETO';
            else performance = '💪 RIPROVA!';
            
            rankItem.innerHTML = `
                <div class="rank-position">
                    <span class="position-icon">${positionIcon}</span>
                </div>
                <div class="rank-player-info">
                    <div class="rank-player-name">${playerName}</div>
                    <div class="rank-performance">${performance}</div>
                </div>
                <div class="rank-score">
                    <span class="score-number">${playerScore}</span>
                    <span class="score-label">punti</span>
                </div>
            `;
            
            rankingsContainer.appendChild(rankItem);
        });
        
        container.appendChild(rankingsContainer);
        
        // Add statistics section
        const statsSection = document.createElement('div');
        statsSection.className = 'final-stats';
        
        const totalPlayers = sortedPlayers.length;
        const maxScore = Math.max(...Object.values(scores));
        const avgScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / totalPlayers);
        
        statsSection.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${totalPlayers}</div>
                    <div class="stat-label">Giocatori</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${maxScore}</div>
                    <div class="stat-label">Punteggio Max</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${avgScore}</div>
                    <div class="stat-label">Media</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">10</div>
                    <div class="stat-label">Round Giocati</div>
                </div>
            </div>
        `;
        
        container.appendChild(statsSection);
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
        try {
            if (!screenName || typeof screenName !== 'string') {
                console.error('Invalid screen name:', screenName);
                return;
            }
            
            // Hide all screens
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
            });
            
            // Show target screen
            const targetScreen = document.getElementById(`${screenName}-screen`);
            if (!targetScreen) {
                console.error(`Screen not found: ${screenName}-screen`);
                return;
            }
            
            targetScreen.classList.add('active');
            this.currentScreen = screenName;
            
            // Hide admin banner when not on results screen
            if (this.adminEditor && screenName !== 'results') {
                this.adminEditor.hide();
            }
            
            console.log(`Switched to screen: ${screenName}`);
        } catch (error) {
            console.error('Error switching screen:', error);
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
        try {
            // Validate input
            if (!message || typeof message !== 'string') {
                console.error('Invalid notification message:', message);
                return;
            }
            
            // Sanitize message
            const sanitizedMessage = message.substring(0, 200); // Max 200 chars
            
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
                ${type === 'warning' ? 'background: linear-gradient(135deg, #ffa726, #ff9800);' : ''}
                ${type === 'info' ? 'background: linear-gradient(135deg, #3742fa, #2f3542);' : ''}
            `;
            
            notification.textContent = sanitizedMessage;
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
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    }
    
    cleanup() {
        try {
            console.log('Cleaning up game client...');
            
            // Remove event listeners
            if (this.removeEventListeners) {
                this.removeEventListeners();
            }
            
            // Clean up timers
            this.cleanupTimers();
            
            // Disconnect socket
            if (this.socket && this.socket.connected) {
                this.socket.disconnect();
            }
            
            // Clear admin editor
            if (this.adminEditor && this.adminEditor.cleanup) {
                this.adminEditor.cleanup();
            }
            
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
    
    safeDisconnect() {
        try {
            if (this.socket && this.socket.connected) {
                // Send leave game event before disconnecting
                this.socket.emit('leave-game');
                
                // Disconnect after a short delay
                setTimeout(() => {
                    if (this.socket && this.socket.connected) {
                        this.socket.disconnect();
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Error during safe disconnect:', error);
        }
    }
}

// Admin Score Editor Class
class AdminScoreEditor {
    constructor(gameClient) {
        try {
            this.gameClient = gameClient;
            this.isOpen = false;
            this.currentRoundScores = {};
            this.originalScores = {};
            this.playersInfo = {}; // Store player ID -> name mapping
            this.boundHandlers = {}; // Store bound event handlers for cleanup
            
            this.initializeElements();
            this.setupEventListeners();
        } catch (error) {
            console.error('Error initializing AdminScoreEditor:', error);
        }
    }
    
    initializeElements() {
        try {
            this.banner = document.getElementById('admin-banner');
            this.modal = document.getElementById('admin-modal');
            this.closeBtn = document.getElementById('admin-close-btn');
            this.saveBtn = document.getElementById('admin-save-btn');
            this.playersList = document.getElementById('admin-players-list');
            
            // Verify essential elements exist
            const missingElements = [];
            if (!this.banner) missingElements.push('admin-banner');
            if (!this.modal) missingElements.push('admin-modal');
            if (!this.closeBtn) missingElements.push('admin-close-btn');
            if (!this.saveBtn) missingElements.push('admin-save-btn');
            if (!this.playersList) missingElements.push('admin-players-list');
            
            if (missingElements.length > 0) {
                console.error('Missing admin elements:', missingElements);
            }
        } catch (error) {
            console.error('Error initializing admin elements:', error);
        }
    }
    
    setupEventListeners() {
        try {
            // Bind handlers for proper cleanup
            this.boundHandlers.openModal = () => this.openModal();
            this.boundHandlers.closeModal = () => this.closeModal();
            this.boundHandlers.saveChanges = () => this.saveChanges();
            this.boundHandlers.modalClick = (e) => {
                if (e.target === this.modal) {
                    this.closeModal();
                }
            };
            
            if (this.banner) {
                this.banner.addEventListener('click', this.boundHandlers.openModal);
            }
            
            if (this.closeBtn) {
                this.closeBtn.addEventListener('click', this.boundHandlers.closeModal);
            }
            
            if (this.modal) {
                this.modal.addEventListener('click', this.boundHandlers.modalClick);
            }
            
            if (this.saveBtn) {
                this.saveBtn.addEventListener('click', this.boundHandlers.saveChanges);
            }
        } catch (error) {
            console.error('Error setting up admin event listeners:', error);
        }
    }
    
    show(roundScores, totalScores, playersData) {
        try {
            console.log('Admin panel showing with scores:', roundScores, totalScores, playersData);
            
            // Validate input data
            if (!roundScores || typeof roundScores !== 'object') {
                console.error('Invalid roundScores data');
                return;
            }
            
            this.currentRoundScores = { ...roundScores };
            this.originalScores = { ...roundScores };
            this.totalScores = { ...totalScores } || {};
            
            // Update players info mapping if provided
            if (playersData && typeof playersData === 'object') {
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
        } catch (error) {
            console.error('Error in AdminScoreEditor show:', error);
        }
    }
    
    hide() {
        try {
            console.log('Admin panel hiding');
            if (this.banner) {
                this.banner.classList.remove('active');
            }
            this.closeModal();
        } catch (error) {
            console.error('Error in AdminScoreEditor hide:', error);
        }
    }
    
    openModal() {
        try {
            console.log('Opening admin modal');
            this.isOpen = true;
            this.renderPlayersList();
            
            if (this.modal) {
                this.modal.classList.add('active');
            }
        } catch (error) {
            console.error('Error opening admin modal:', error);
        }
    }
    
    closeModal() {
        try {
            console.log('Closing admin modal');
            this.isOpen = false;
            
            if (this.modal) {
                this.modal.classList.remove('active');
            }
        } catch (error) {
            console.error('Error closing admin modal:', error);
        }
    }
    
    renderPlayersList() {
        try {
            if (!this.playersList) {
                console.error('Players list element not found');
                return;
            }
            
            console.log('Rendering players list:');
            console.log('- currentRoundScores:', this.currentRoundScores);
            console.log('- playersInfo:', this.playersInfo);
            console.log('- gameClient.gameState:', this.gameClient?.gameState);
            
            this.playersList.innerHTML = '';
            
            if (!this.currentRoundScores || typeof this.currentRoundScores !== 'object') {
                console.error('Invalid currentRoundScores data');
                return;
            }
            
            Object.keys(this.currentRoundScores).forEach(playerId => {
                try {
                    // Get the actual player name from gameState
                    const playerName = this.getPlayerNameById(playerId);
                    
                    console.log(`Player ID: ${playerId} -> Name: ${playerName}`);
                    
                    const playerDiv = document.createElement('div');
                    playerDiv.className = 'admin-player-item';
                    
                    const currentScore = this.currentRoundScores[playerId] || 0;
                    const totalScore = this.totalScores[playerId] || 0;
                    
                    // Validate scores are numbers
                    const validCurrentScore = isNaN(currentScore) ? 0 : parseInt(currentScore, 10);
                    const validTotalScore = isNaN(totalScore) ? 0 : parseInt(totalScore, 10);
                    
                    playerDiv.innerHTML = `
                        <div class="admin-player-info">
                            <div class="admin-player-name">${this.sanitizeHTML(playerName)}</div>
                            <div class="admin-player-round-score">Punteggio round: ${validCurrentScore} | Totale: ${validTotalScore}</div>
                        </div>
                        <div class="admin-score-controls">
                            <input type="number" 
                                   class="admin-score-input" 
                                   value="${validCurrentScore}" 
                                   data-player="${playerId}"
                                   min="0" 
                                   max="70"
                                   step="1">
                            <button class="admin-btn" onclick="window.adminEditor?.setScore('${playerId}', 0)">
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
            if (input) {
                input.addEventListener('input', (e) => {
                    try {
                        const newScore = parseInt(e.target.value, 10) || 0;
                        this.setScore(playerId, newScore);
                    } catch (error) {
                        console.error('Error handling score input:', error);
                    }
                });
            }
                } catch (error) {
                    console.error('Error rendering player:', playerId, error);
                }
            });
        } catch (error) {
            console.error('Error in renderPlayersList:', error);
        }
    }
    
    sanitizeHTML(text) {
        try {
            if (typeof text !== 'string') {
                return 'Player';
            }
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        } catch (error) {
            console.error('Error sanitizing HTML:', error);
            return 'Player';
        }
    }
    
    getPlayerNameById(playerId) {
        try {
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
        } catch (error) {
            console.error('Error getting player name:', error);
            return 'Player';
        }
    }
    
    setScore(playerId, newScore) {
        try {
            console.log(`Setting score for ${playerId} to ${newScore}`);
            
            // Validate inputs
            if (!playerId || typeof playerId !== 'string') {
                console.error('Invalid playerId');
                return;
            }
            
            if (isNaN(newScore)) {
                console.error('Invalid score value');
                return;
            }
            
            this.currentRoundScores[playerId] = Math.max(0, Math.min(70, parseInt(newScore, 10)));
            
            // Update the input if it was changed programmatically
            const input = document.querySelector(`[data-player="${playerId}"]`);
            if (input && parseInt(input.value, 10) !== this.currentRoundScores[playerId]) {
                input.value = this.currentRoundScores[playerId];
            }
            
            this.updateTotalDisplay(playerId);
        } catch (error) {
            console.error('Error setting score:', error);
        }
    }
    
    adjustScore(playerId, adjustment) {
        try {
            const currentScore = this.currentRoundScores[playerId] || 0;
            this.setScore(playerId, currentScore + parseInt(adjustment, 10));
            this.renderPlayersList();
        } catch (error) {
            console.error('Error adjusting score:', error);
        }
    }
    
    updateTotalDisplay(playerId) {
        try {
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
        } catch (error) {
            console.error('Error updating total display:', error);
        }
    }
    
    saveChanges() {
        try {
            console.log('Saving score changes...');
            
            const changes = {};
            let hasChanges = false;
            
            if (!this.currentRoundScores || !this.originalScores) {
                console.error('Invalid score data');
                this.gameClient.showNotification('Errore nei dati dei punteggi', 'error');
                return;
            }
            
            Object.keys(this.currentRoundScores).forEach(playerId => {
                try {
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
                } catch (error) {
                    console.error('Error processing score change for player:', playerId, error);
                }
            });
            
            if (hasChanges) {
                console.log('Sending score changes to server:', changes);
                
                if (this.gameClient && this.gameClient.socket) {
                    this.gameClient.socket.emit('admin-score-update', changes);
                    this.gameClient.showNotification('Punteggi aggiornati!', 'success');
                } else {
                    console.error('Socket not available');
                    this.gameClient.showNotification('Errore di connessione', 'error');
                }
            } else {
                this.gameClient.showNotification('Nessuna modifica da salvare', 'info');
            }
            
            this.closeModal();
        } catch (error) {
            console.error('Error in saveChanges:', error);
            this.gameClient.showNotification('Errore nel salvataggio', 'error');
        }
    }
    
    cleanup() {
        try {
            // Remove event listeners
            if (this.boundHandlers) {
                if (this.banner && this.boundHandlers.openModal) {
                    this.banner.removeEventListener('click', this.boundHandlers.openModal);
                }
                
                if (this.closeBtn && this.boundHandlers.closeModal) {
                    this.closeBtn.removeEventListener('click', this.boundHandlers.closeModal);
                }
                
                if (this.modal && this.boundHandlers.modalClick) {
                    this.modal.removeEventListener('click', this.boundHandlers.modalClick);
                }
                
                if (this.saveBtn && this.boundHandlers.saveChanges) {
                    this.saveBtn.removeEventListener('click', this.boundHandlers.saveChanges);
                }
            }
            
            // Clear data
            this.currentRoundScores = {};
            this.originalScores = {};
            this.playersInfo = {};
            this.boundHandlers = {};
            
        } catch (error) {
            console.error('Error during AdminScoreEditor cleanup:', error);
        }
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.gameClient = new GameClient();
        window.gameClient.initializeApp();
        
        // Setup cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (window.gameClient) {
                window.gameClient.cleanup();
            }
        });
        
        // Setup cleanup on visibility change (tab switch/close)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && window.gameClient) {
                window.gameClient.safeDisconnect();
            }
        });
        
    } catch (error) {
        console.error('Error initializing game:', error);
    }
});

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
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
