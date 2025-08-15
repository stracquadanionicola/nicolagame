const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Add connection timeout and retry settings
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

// Serve static files with no cache headers
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css') || path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Game state
let gameState = {
    players: {},
    currentRound: 0,
    maxRounds: 10,
    maxPlayers: 10, // Maximum 10 players
    gameStarted: false,
    currentLetter: '',
    roundStartTime: null,
    roundDuration: 60000, // 1 minute per round
    scores: {},
    roundTimer: null,
    usedLetters: [], // Track used letters
    roundScores: {} // Initialize round scores tracking
};

// Categories for the game
const categories = ['Nome', 'Cognome', 'Città', 'Animale', 'Cosa', 'Mestiere', 'Personaggi Televisivi'];

// Generate random letter (excluding difficult ones and already used letters)
function getRandomLetter() {
    const allLetters = 'ABCDEFGHILMNOPQRSTUVZ';
    let availableLetters = allLetters.split('').filter(letter => 
        !gameState.usedLetters.includes(letter)
    );
    
    // If all letters are used, reset the used letters (shouldn't happen with 10 rounds)
    if (availableLetters.length === 0) {
        console.log('All letters used, resetting...');
        gameState.usedLetters = [];
        availableLetters = allLetters.split('');
    }
    
    const selectedLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
    gameState.usedLetters.push(selectedLetter);
    
    console.log(`Selected letter: ${selectedLetter}, Used letters: ${gameState.usedLetters.join(', ')}`);
    return selectedLetter;
}

// Calculate points for answers
function calculatePoints(answers, allAnswers, currentLetter) {
    let points = 0;
    
    for (const category in answers) {
        const answer = answers[category].toLowerCase().trim();
        if (answer === '') {
            continue; // No points for empty answers
        }
        
        // Check if answer starts with the correct letter
        const firstLetter = answer.charAt(0).toUpperCase();
        if (firstLetter !== currentLetter) {
            continue; // 0 points for wrong letter
        }
        
        // Count how many players gave the same answer (case insensitive)
        const sameAnswers = Object.values(allAnswers).filter(playerAnswers => 
            playerAnswers[category] && 
            playerAnswers[category].toLowerCase().trim() === answer &&
            playerAnswers[category].charAt(0).toUpperCase() === currentLetter
        ).length;
        
        // New scoring system: 10 for unique correct, 5 for shared correct
        if (sameAnswers === 1) {
            points += 10; // Unique correct answer
        } else {
            points += 5;  // Shared correct answer
        }
    }
    
    return points;
}

// Helper function to find player ID by name
function findPlayerIdByName(playerName) {
    for (const [playerId, player] of Object.entries(gameState.players)) {
        if (player.name === playerName) {
            return playerId;
        }
    }
    return null;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Add error handling for all socket events
    socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
    });
    
    // Player joins the game
    socket.on('join-game', (playerName) => {
        try {
            // Validate input
            if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
                console.log(`Invalid player name from ${socket.id}:`, playerName);
                socket.emit('join-error', { message: 'Nome giocatore non valido' });
                return;
            }
            
            // Sanitize player name
            const sanitizedName = playerName.trim().substring(0, 20); // Max 20 characters
            
            // Check if game is full
            const currentPlayerCount = Object.keys(gameState.players).length;
            if (currentPlayerCount >= gameState.maxPlayers) {
                socket.emit('game-full', {
                    message: `Il gioco è pieno! Massimo ${gameState.maxPlayers} giocatori consentiti.`,
                    maxPlayers: gameState.maxPlayers,
                    currentPlayers: currentPlayerCount
                });
                return;
            }

            const playerId = uuidv4();
            gameState.players[socket.id] = {
                id: playerId,
                name: sanitizedName,
                answers: {},
            ready: false,
            submitted: false // Initialize submitted status
        };
        gameState.scores[socket.id] = 0;
        
        console.log(`Player ${playerName} joined. Current players: ${currentPlayerCount + 1}/${gameState.maxPlayers}`);
        
        // Send current game state to new player
        socket.emit('game-state', {
            players: Object.values(gameState.players),
            currentRound: gameState.currentRound,
            maxRounds: gameState.maxRounds,
            gameStarted: gameState.gameStarted,
            scores: gameState.scores
        });
        
        // Notify all players of new player
        io.emit('player-joined', {
            players: Object.values(gameState.players)
        });
        
        } catch (error) {
            console.error(`Error in join-game for ${socket.id}:`, error);
            socket.emit('join-error', { message: 'Errore durante l\'ingresso nel gioco' });
        }
    });
    
    // Player sets ready in lobby (initial ready)
    socket.on('set-ready', () => {
        if (gameState.players[socket.id]) {
            gameState.players[socket.id].ready = true;
            console.log(`Player ${gameState.players[socket.id].name} is ready in lobby`);
            
            // Always update all players about ready status (visual feedback)
            io.emit('player-joined', {
                players: Object.values(gameState.players)
            });
            
            // Check if all players are ready and we have at least 2 players
            const connectedPlayers = Object.values(gameState.players);
            const readyPlayers = connectedPlayers.filter(player => player.ready);
            const allReady = connectedPlayers.length > 0 && connectedPlayers.every(player => player.ready);
            const playerCount = connectedPlayers.length;
            
            console.log(`Ready status: ${allReady}, Ready players: ${readyPlayers.length}/${playerCount}`);
            
            io.emit('players-ready-status', {
                readyPlayers: readyPlayers.length,
                totalPlayers: playerCount
            });
            
            // Game starts only with 2+ players AND all must be ready
            if (allReady && playerCount >= 2 && !gameState.gameStarted) {
                console.log('Starting game - all players ready!');
                gameState.gameStarted = true;
                startNewRound();
            }
        }
    });

    // Player ready for next round
    socket.on('player-ready', () => {
        if (gameState.players[socket.id]) {
            gameState.players[socket.id].ready = true;
            
            console.log(`Player ${gameState.players[socket.id].name} is ready. Current round: ${gameState.currentRound}, Max rounds: ${gameState.maxRounds}`);
            
            // Don't start new round if game is already finished
            if (gameState.currentRound >= gameState.maxRounds) {
                console.log('Game already finished, not starting new round');
                return;
            }
            
            // Check if all players are ready for next round
            const connectedPlayers = Object.values(gameState.players);
            const readyPlayers = connectedPlayers.filter(player => player.ready);
            const allReady = connectedPlayers.length > 0 && connectedPlayers.every(player => player.ready);
            const playerCount = connectedPlayers.length;
            
            console.log(`Next round ready check: ${readyPlayers.length}/${playerCount} ready, all ready: ${allReady}`);
            
            if (allReady && playerCount >= 2) {
                console.log('All players ready, starting new round');
                startNewRound();
            }
            
            io.emit('players-ready-status', {
                readyPlayers: Object.values(gameState.players).filter(p => p.ready).length,
                totalPlayers: Object.values(gameState.players).length
            });
        }
    });
    
    // Player submits answers
    socket.on('submit-answers', (answers) => {
        try {
            // Validate player exists and game is active
            if (!gameState.players[socket.id]) {
                console.log(`Submit answers from unknown player: ${socket.id}`);
                return;
            }
            
            if (!gameState.gameStarted) {
                console.log(`Submit answers outside game from ${gameState.players[socket.id].name}`);
                return;
            }
            
            // Prevent double submission
            if (gameState.players[socket.id].submitted) {
                console.log(`Player ${gameState.players[socket.id].name} tried to submit answers twice, ignoring`);
                return;
            }
            
            // Validate and sanitize answers
            const sanitizedAnswers = {};
            if (answers && typeof answers === 'object') {
                for (const [category, answer] of Object.entries(answers)) {
                    if (typeof answer === 'string') {
                        // Sanitize answer: remove dangerous characters, limit length
                        sanitizedAnswers[category] = answer.trim().substring(0, 50).replace(/[<>"'&]/g, '');
                    } else {
                        sanitizedAnswers[category] = '';
                    }
                }
            }
            
            gameState.players[socket.id].answers = sanitizedAnswers;
            gameState.players[socket.id].submitted = true;
            
            console.log(`Player ${gameState.players[socket.id].name} submitted answers:`, sanitizedAnswers);
            
            // Check if all connected players have submitted
            const connectedPlayers = Object.values(gameState.players);
            const submittedPlayers = connectedPlayers.filter(player => player.submitted === true);
            const allSubmitted = connectedPlayers.length > 0 && connectedPlayers.every(player => player.submitted === true);
            
            console.log(`Submission status: ${submittedPlayers.length}/${connectedPlayers.length} submitted, all submitted: ${allSubmitted}`);
            
            // Only end round early if ALL remaining players have submitted AND there are players
            if (allSubmitted && connectedPlayers.length > 0) {
                console.log('All remaining connected players submitted, ending round early');
                endRound();
            } else {
                console.log(`Waiting for more submissions or timer expiry. Current: ${submittedPlayers.length}/${connectedPlayers.length}`);
            }
        } catch (error) {
            console.error(`Error in submit-answers for ${socket.id}:`, error);
        }
    });
    
    // Player updates answers (for auto-save, doesn't count as submission)
    socket.on('update-answers', (answers) => {
        try {
            // Only update if player exists and game is active and they haven't submitted yet
            if (gameState.players[socket.id] && gameState.gameStarted && !gameState.players[socket.id].submitted) {
                // Validate and sanitize answers
                const sanitizedAnswers = {};
                if (answers && typeof answers === 'object') {
                    for (const [category, answer] of Object.entries(answers)) {
                        if (typeof answer === 'string') {
                            sanitizedAnswers[category] = answer.trim().substring(0, 50).replace(/[<>"'&]/g, '');
                        } else {
                            sanitizedAnswers[category] = '';
                        }
                    }
                }
                
                // Update answers but don't mark as submitted
                gameState.players[socket.id].answers = sanitizedAnswers;
                console.log(`Updated answers for ${gameState.players[socket.id].name} (auto-save)`);
            }
        } catch (error) {
            console.error(`Error in update-answers for ${socket.id}:`, error);
        }
    });
    
    // Admin score update
    socket.on('admin-score-update', (changes) => {
        console.log('Admin score update received:', changes);
        
        // Apply score changes - changes object has playerId as key
        Object.keys(changes).forEach(playerId => {
            const change = changes[playerId];
            
            // Verify the player exists
            if (gameState.players[playerId]) {
                const playerName = gameState.players[playerId].name;
                const oldTotal = gameState.scores[playerId] || 0;
                
                // Calculate new total score based on the difference
                const newTotal = oldTotal + change.difference;
                gameState.scores[playerId] = Math.max(0, newTotal);
                
                console.log(`Updated ${playerName} (${playerId}) score: ${oldTotal} -> ${gameState.scores[playerId]} (difference: ${change.difference})`);
            } else {
                console.log(`Player ${playerId} not found in game state`);
            }
        });
        
        // Emit updated scores to all clients
        const currentScores = {};
        Object.keys(gameState.players).forEach(playerId => {
            const playerName = gameState.players[playerId].name;
            currentScores[playerName] = gameState.scores[playerId] || 0;
        });
        
        io.emit('scores-updated', {
            totalScores: currentScores,
            roundScores: gameState.roundScores || {},
            message: 'Punteggi aggiornati dall\'amministratore'
        });
        
        console.log('Updated total scores sent to all clients:', currentScores);
    });
    
    // Player disconnects
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (gameState.players[socket.id]) {
            console.log(`Player ${gameState.players[socket.id].name} disconnected`);
        }
        
        delete gameState.players[socket.id];
        delete gameState.scores[socket.id];
        
        // Check if game should continue or reset
        const remainingPlayers = Object.keys(gameState.players).length;
        
        if (remainingPlayers === 0) {
            console.log('No players remaining, resetting game state');
            // Reset game state when no players left
            gameState = {
                players: {},
                currentRound: 0,
                maxRounds: 10,
                maxPlayers: 10,
                gameStarted: false,
                currentLetter: '',
                roundStartTime: null,
                roundDuration: 60000,
                scores: {},
                roundTimer: null,
                usedLetters: [],
                roundScores: {} // Initialize round scores tracking
            };
        } else if (remainingPlayers === 1 && gameState.gameStarted) {
            console.log('Only one player remaining, ending game');
            endGame();
        }
        
        io.emit('player-left', {
            players: Object.values(gameState.players)
        });
    });
});

function startNewRound() {
    // Clear any existing timer
    if (gameState.roundTimer) {
        clearTimeout(gameState.roundTimer);
        gameState.roundTimer = null;
    }
    
    gameState.currentRound++;
    gameState.currentLetter = getRandomLetter();
    gameState.roundStartTime = Date.now();
    gameState.gameStarted = true;
    
    // Reset player ready status, answers, and submission status
    Object.values(gameState.players).forEach(player => {
        player.ready = false;
        player.answers = {};
        player.submitted = false; // Explicitly set to false for all players
    });
    
    console.log(`Starting round ${gameState.currentRound} with letter ${gameState.currentLetter}`);
    
    io.emit('round-started', {
        round: gameState.currentRound,
        letter: gameState.currentLetter,
        categories: categories,
        duration: gameState.roundDuration,
        maxRounds: gameState.maxRounds
    });
    
    // Auto-end round after duration
    gameState.roundTimer = setTimeout(() => {
        if (gameState.currentRound > 0 && gameState.gameStarted) {
            console.log('Round time expired, force-ending round and auto-submitting for all remaining players');
            
            // Get all currently connected players
            const connectedPlayers = Object.values(gameState.players);
            console.log(`Force-submitting for ${connectedPlayers.length} connected players`);
            
            // Mark all remaining players as submitted with their current answers
            connectedPlayers.forEach(player => {
                if (!player.submitted) {
                    player.submitted = true;
                    // Ensure they have an answers object, even if empty
                    if (!player.answers) {
                        player.answers = {};
                    }
                    console.log(`Auto-submitted for player ${player.name} with answers:`, player.answers);
                }
            });
            
            // Force end the round regardless of submission status
            endRound();
        }
    }, gameState.roundDuration);
}

function endRound() {
    // Prevent multiple calls to endRound
    if (!gameState.gameStarted || gameState.currentRound === 0) {
        console.log('Round already ended or not started, ignoring endRound call');
        return;
    }
    
    console.log('Ending round', gameState.currentRound);
    
    // Clear the timer to prevent double execution
    if (gameState.roundTimer) {
        clearTimeout(gameState.roundTimer);
        gameState.roundTimer = null;
    }
    
    gameState.gameStarted = false; // Mark round as ended
    
    // Calculate points for each player
    const allAnswers = {};
    Object.keys(gameState.players).forEach(socketId => {
        const answers = gameState.players[socketId].answers || {};
        allAnswers[socketId] = answers;
        console.log(`Player ${gameState.players[socketId].name} answers:`, answers);
    });
    
    const roundScores = {};
    Object.keys(gameState.players).forEach(socketId => {
        const answers = gameState.players[socketId].answers || {};
        const points = calculatePoints(answers, allAnswers, gameState.currentLetter);
        console.log(`Player ${gameState.players[socketId].name} scored ${points} points`);
        
        if (!gameState.scores[socketId]) {
            gameState.scores[socketId] = 0;
        }
        gameState.scores[socketId] += points;
        roundScores[socketId] = points;
    });
    
    console.log('Round scores:', roundScores);
    console.log('Total scores:', gameState.scores);
    
    // Reset ready status for next round
    Object.values(gameState.players).forEach(player => {
        player.ready = false;
    });
    
    // Send round results
    gameState.roundScores = roundScores; // Store round scores for admin access
    io.emit('round-ended', {
        answers: allAnswers,
        roundScores: roundScores,
        totalScores: gameState.scores,
        players: gameState.players,
        round: gameState.currentRound,
        maxRounds: gameState.maxRounds
    });
    
    // Check if game is finished
    if (gameState.currentRound >= gameState.maxRounds) {
        setTimeout(() => {
            endGame();
        }, 2000); // Give time to show results
    }
}

function endGame() {
    // Find winner(s) - handle ties
    let maxScore = -1;
    let winners = [];
    
    Object.keys(gameState.scores).forEach(socketId => {
        if (gameState.scores[socketId] > maxScore) {
            maxScore = gameState.scores[socketId];
            winners = [socketId];
        } else if (gameState.scores[socketId] === maxScore) {
            winners.push(socketId);
        }
    });
    
    // Create winners array with player info - safely handle disconnected players
    const winnerPlayers = winners.map(socketId => gameState.players[socketId]).filter(player => player !== undefined);
    
    // Fallback if no valid winners (all disconnected)
    if (winnerPlayers.length === 0) {
        console.log('No valid winners found, all players disconnected');
        io.emit('game-ended', {
            winners: [],
            maxScore: 0,
            finalScores: gameState.scores,
            players: gameState.players,
            isTie: false,
            message: 'Gioco terminato - tutti i giocatori si sono disconnessi'
        });
    } else {
        console.log(`Game ended. Winners: ${winnerPlayers.map(p => p.name).join(', ')} with ${maxScore} points`);
        
        io.emit('game-ended', {
            winners: winnerPlayers,
            maxScore: maxScore,
            finalScores: gameState.scores,
            players: gameState.players,
            isTie: winners.length > 1
        });
    }
    
    // Reset game state
    gameState = {
        players: {},
        currentRound: 0,
        maxRounds: 10,
        maxPlayers: 10, // Keep the player limit
        gameStarted: false,
        currentLetter: '',
        roundStartTime: null,
        roundDuration: 60000,
        scores: {},
        roundTimer: null,
        usedLetters: [] // Reset used letters for new game
    };
}

const PORT = process.env.PORT || 3000;

// Add more comprehensive logging
console.log('Starting server...');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', PORT);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Server started successfully!');
}).on('error', (err) => {
    console.error('Server failed to start:', err);
    process.exit(1);
});
