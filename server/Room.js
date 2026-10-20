const Player = require('./Player');
const Game = require('./Game');
const { S2C } = require('./protocol');

class Room {
    constructor(code) {
        this.code = code;
        this.players = [];       // Array of Player objects, max 4
        this.sockets = new Map(); // playerId -> ws
        this.game = null;
        this.state = 'WAITING';  // WAITING | IN_GAME | FINISHED
        this.hostId = null;      // First player to join
    }

    addPlayer(ws, playerId, name) {
        if (this.players.length >= 4) {
            this.sendTo(playerId, { type: S2C.ERROR, message: 'Room is full' });
            return null;
        }

        // Check for duplicate names
        if (this.players.some(p => p.name === name)) {
            this.sendTo(playerId, { type: S2C.ERROR, message: 'Name already taken in this room' });
            return null;
        }

        const seatIndex = this.players.length; // 0, 1, 2, 3
        const player = new Player(playerId, name, seatIndex);

        this.players.push(player);
        this.sockets.set(playerId, ws);

        if (this.players.length === 1) {
            this.hostId = playerId;
        }

        // Notify all existing players
        this.broadcast({
            type: S2C.PLAYER_JOINED,
            name,
            seat: seatIndex,
            team: player.team,
        });

        return player;
    }

    removePlayer(playerId) {
        const playerIdx = this.players.findIndex(p => p.id === playerId);
        if (playerIdx === -1) return;

        const player = this.players[playerIdx];
        this.players.splice(playerIdx, 1);
        this.sockets.delete(playerId);

        // Reassign seats
        this.players.forEach((p, i) => {
            p.seatIndex = i;
            p.team = i % 2;
        });

        // Reassign host if needed
        if (this.hostId === playerId && this.players.length > 0) {
            this.hostId = this.players[0].id;
        }

        this.broadcast({
            type: S2C.PLAYER_LEFT,
            seat: player.seatIndex,
            remainingPlayers: this.players.map(p => ({
                name: p.name,
                seat: p.seatIndex,
                team: p.team,
            })),
        });
    }

    getPlayer(playerId) {
        return this.players.find(p => p.id === playerId);
    }

    startGame() {
        if (this.players.length !== 4) return false;
        if (this.state === 'IN_GAME') return false;

        this.state = 'IN_GAME';

        // Reset hands
        this.players.forEach(p => { p.hand = []; });

        this.game = new Game(
            this.players,
            () => this.sendGameState(),
            (result) => this.broadcastTrickResult(result),
            (result) => this.handleRoundOver(result),
        );

        this.game.start();
        return true;
    }

    sendGameState() {
        for (const player of this.players) {
            if (!player.connected) continue;
            const state = this.game.getStateForPlayer(player.id);
            if (state) {
                this.sendTo(player.id, { type: S2C.GAME_STATE, ...state });
            }
        }
    }

    broadcastTrickResult(result) {
        this.broadcast({ type: S2C.TRICK_RESULT, ...result });
    }

    handleRoundOver(result) {
        this.state = 'FINISHED';
        this.broadcast({ type: S2C.ROUND_OVER, ...result });
    }

    handleDeclaration(declaration) {
        this.broadcast({ type: S2C.DECLARATION, ...declaration });

        // End the round after a short delay
        setTimeout(() => {
            this.handleRoundOver({
                winningTeam: declaration.winningTeam,
                scores: this.game ? [...this.game.teamScores] : [0, 0],
                reason: declaration.reason,
            });
        }, 2000);
    }

    reconnectPlayer(ws, playerId, name) {
        const existingPlayer = this.players.find(p => p.name === name && !p.connected);
        if (!existingPlayer) return null;

        existingPlayer.connected = true;
        if (existingPlayer.reconnectTimer) {
            clearTimeout(existingPlayer.reconnectTimer);
            existingPlayer.reconnectTimer = null;
        }

        // Update socket mapping
        this.sockets.set(existingPlayer.id, ws);

        this.broadcast({
            type: S2C.PLAYER_RECONNECTED,
            seat: existingPlayer.seatIndex,
            name: existingPlayer.name,
        });

        // Send current game state to reconnected player
        if (this.game) {
            const state = this.game.getStateForPlayer(existingPlayer.id);
            if (state) {
                this.sendTo(existingPlayer.id, { type: S2C.GAME_STATE, ...state });
            }
        }

        return existingPlayer;
    }

    handleDisconnect(playerId) {
        const player = this.getPlayer(playerId);
        if (!player) return;

        player.connected = false;
        this.sockets.delete(playerId);

        if (this.state === 'WAITING') {
            this.removePlayer(playerId);
            return;
        }

        // In-game: notify others and start reconnect timer
        this.broadcast({
            type: S2C.PLAYER_LEFT,
            seat: player.seatIndex,
            name: player.name,
            disconnected: true,
        });

        player.reconnectTimer = setTimeout(() => {
            // Forfeit: opponent team wins
            const opponentTeam = player.team === 0 ? 1 : 0;
            this.handleRoundOver({
                winningTeam: opponentTeam,
                scores: this.game ? [...this.game.teamScores] : [0, 0],
                reason: `${player.name} disconnected`,
            });
        }, 60000);
    }

    rematch() {
        if (this.state !== 'FINISHED') return false;
        if (this.game) {
            this.game.cleanup();
        }
        return this.startGame();
    }

    broadcast(msg) {
        const data = JSON.stringify(msg);
        for (const player of this.players) {
            if (!player.connected) continue;
            const ws = this.sockets.get(player.id);
            if (ws && ws.readyState === 1) { // WebSocket.OPEN = 1
                ws.send(data);
            }
        }
    }

    sendTo(playerId, msg) {
        const ws = this.sockets.get(playerId);
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify(msg));
        }
    }

    isEmpty() {
        return this.players.length === 0 || this.players.every(p => !p.connected);
    }
}

module.exports = Room;
