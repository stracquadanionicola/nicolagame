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
    }
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
    roundDuration: 120000, // 2 minutes per round
    scores: {},
    roundTimer: null,
    usedLetters: [] // Track used letters
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
    
    // Player joins the game
    socket.on('join-game', (playerName) => {
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
            name: playerName,
            answers: {},
            ready: false
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
            
            // Check if all players are ready and we have at least 2 players (back to 2)
            const allReady = Object.values(gameState.players).every(player => player.ready);
            const playerCount = Object.keys(gameState.players).length;
            
            console.log(`Ready status: ${allReady}, Player count: ${playerCount}`);
            
            io.emit('players-ready-status', {
                readyPlayers: Object.values(gameState.players).filter(p => p.ready).length,
                totalPlayers: playerCount
            });
            
            // Game starts only with 2+ players
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
            
            // Check if all players are ready
            const allReady = Object.values(gameState.players).every(player => player.ready);
            
            if (allReady && Object.keys(gameState.players).length >= 2) {
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
        if (gameState.players[socket.id] && gameState.gameStarted) {
            gameState.players[socket.id].answers = answers;
            gameState.players[socket.id].submitted = true;
            
            console.log(`Player ${gameState.players[socket.id].name} submitted answers:`, answers);
            
            // Check if all players have submitted
            const allSubmitted = Object.values(gameState.players).every(player => 
                player.submitted === true
            );
            
            console.log(`All submitted: ${allSubmitted}, Players:`, Object.values(gameState.players).map(p => ({name: p.name, submitted: p.submitted})));
            
            if (allSubmitted) {
                console.log('All players submitted, ending round');
                endRound();
            }
        }
    });
    
    // Admin score update
    socket.on('admin-score-update', (changes) => {
        console.log('Admin score update received:', changes);
        
        // Apply score changes
        Object.keys(changes).forEach(playerName => {
            const change = changes[playerName];
            const playerId = findPlayerIdByName(playerName);
            
            if (playerId && gameState.scores[playerId]) {
                const oldTotal = gameState.scores[playerId];
                const newTotal = oldTotal + change.difference;
                gameState.scores[playerId] = Math.max(0, newTotal);
                
                console.log(`Updated ${playerName} score: ${oldTotal} -> ${gameState.scores[playerId]}`);
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
            message: 'Punteggi aggiornati dall\'amministratore'
        });
    });
    
    // Player disconnects
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete gameState.players[socket.id];
        delete gameState.scores[socket.id];
        
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
        player.submitted = false;
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
            console.log('Round time expired, ending round');
            endRound();
        }
    }, gameState.roundDuration);
}

function endRound() {
    // Prevent multiple calls to endRound
    if (!gameState.gameStarted) {
        console.log('Round already ended, ignoring');
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
    
    // Create winners array with player info
    const winnerPlayers = winners.map(socketId => gameState.players[socketId]);
    
    console.log(`Game ended. Winners: ${winnerPlayers.map(p => p.name).join(', ')} with ${maxScore} points`);
    
    io.emit('game-ended', {
        winners: winnerPlayers,
        maxScore: maxScore,
        finalScores: gameState.scores,
        players: gameState.players,
        isTie: winners.length > 1
    });
    
    // Reset game state
    gameState = {
        players: {},
        currentRound: 0,
        maxRounds: 10,
        maxPlayers: 10, // Keep the player limit
        gameStarted: false,
        currentLetter: '',
        roundStartTime: null,
        roundDuration: 120000,
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
