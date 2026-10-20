const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const Room = require('./Room');
const { C2S, S2C } = require('./protocol');
const { generateRoomCode, generateId } = require('./utils');

const PORT = process.env.PORT || 3000;
const rooms = new Map();          // roomCode -> Room
const playerRooms = new Map();    // playerId -> roomCode

// --- MIME types for static file serving ---
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

// --- HTTP server: serves client/ as static files ---
const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0]; // strip query string
    if (urlPath === '/') urlPath = '/index.html';

    // Prevent directory traversal
    const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(__dirname, '..', 'client', safePath);

    // Ensure we're still within client directory
    const clientDir = path.join(__dirname, '..', 'client');
    if (!filePath.startsWith(clientDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// --- WebSocket server ---
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    const playerId = generateId();
    ws.playerId = playerId;

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            sendError(ws, 'Invalid message format');
            return;
        }
        handleMessage(ws, playerId, msg);
    });

    ws.on('close', () => {
        handleDisconnect(playerId);
    });
});

function handleMessage(ws, playerId, msg) {
    switch (msg.type) {
        case C2S.CREATE_ROOM:
            handleCreateRoom(ws, playerId, msg);
            break;
        case C2S.JOIN_ROOM:
            handleJoinRoom(ws, playerId, msg);
            break;
        case C2S.START_GAME:
            handleStartGame(playerId);
            break;
        case C2S.PLAY_CARDS:
            handlePlayCards(playerId, msg);
            break;
        case C2S.DECLARE:
            handleDeclare(playerId, msg);
            break;
        case C2S.REMATCH:
            handleRematch(playerId);
            break;
        default:
            sendError(ws, 'Unknown message type');
    }
}

function handleCreateRoom(ws, playerId, msg) {
    const name = (msg.name || '').trim().substring(0, 12);
    if (!name) {
        sendError(ws, 'Name is required');
        return;
    }

    const code = generateRoomCode(rooms);
    const room = new Room(code);
    rooms.set(code, room);

    const player = room.addPlayer(ws, playerId, name);
    if (!player) return;

    playerRooms.set(playerId, code);

    ws.send(JSON.stringify({
        type: S2C.ROOM_CREATED,
        roomCode: code,
        seat: player.seatIndex,
        playerId,
        isHost: true,
        players: room.players.map(p => ({
            name: p.name,
            seat: p.seatIndex,
            team: p.team,
        })),
    }));
}

function handleJoinRoom(ws, playerId, msg) {
    const name = (msg.name || '').trim().substring(0, 12);
    const code = (msg.roomCode || '').toUpperCase().trim();

    if (!name) {
        sendError(ws, 'Name is required');
        return;
    }
    if (!code) {
        sendError(ws, 'Room code is required');
        return;
    }

    const room = rooms.get(code);
    if (!room) {
        sendError(ws, 'Room not found');
        return;
    }

    // Try reconnection first
    if (room.state === 'IN_GAME') {
        const reconnected = room.reconnectPlayer(ws, playerId, name);
        if (reconnected) {
            // Update the player ID mapping since this is a new ws connection
            ws.playerId = reconnected.id;
            playerRooms.set(reconnected.id, code);
            ws.send(JSON.stringify({
                type: S2C.ROOM_JOINED,
                roomCode: code,
                seat: reconnected.seatIndex,
                playerId: reconnected.id,
                isHost: room.hostId === reconnected.id,
                players: room.players.map(p => ({
                    name: p.name,
                    seat: p.seatIndex,
                    team: p.team,
                    connected: p.connected,
                })),
                reconnected: true,
            }));
            return;
        }
    }

    if (room.state !== 'WAITING') {
        sendError(ws, 'Game already in progress');
        return;
    }

    const player = room.addPlayer(ws, playerId, name);
    if (!player) return;

    playerRooms.set(playerId, code);

    ws.send(JSON.stringify({
        type: S2C.ROOM_JOINED,
        roomCode: code,
        seat: player.seatIndex,
        playerId,
        isHost: room.hostId === playerId,
        players: room.players.map(p => ({
            name: p.name,
            seat: p.seatIndex,
            team: p.team,
        })),
    }));
}

function handleStartGame(playerId) {
    const room = getPlayerRoom(playerId);
    if (!room) return;

    if (room.hostId !== playerId) {
        const ws = room.sockets.get(playerId);
        if (ws) sendError(ws, 'Only the host can start the game');
        return;
    }

    if (!room.startGame()) {
        const ws = room.sockets.get(playerId);
        if (ws) sendError(ws, 'Need 4 players to start');
    }
}

function handlePlayCards(playerId, msg) {
    const room = getPlayerRoom(playerId);
    if (!room || !room.game) return;

    const cardIds = msg.cardIds;
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
        const ws = room.sockets.get(playerId);
        if (ws) sendError(ws, 'No cards selected');
        return;
    }

    const result = room.game.playCards(playerId, cardIds);
    if (!result.valid) {
        const ws = room.sockets.get(playerId);
        if (ws) sendError(ws, result.error);
    }
}

function handleDeclare(playerId, msg) {
    const room = getPlayerRoom(playerId);
    if (!room || !room.game) return;

    const result = room.game.declare(playerId, msg.declareType);
    if (!result.valid) {
        const ws = room.sockets.get(playerId);
        if (ws) sendError(ws, result.error);
        return;
    }

    room.handleDeclaration(result.declaration);
}

function handleRematch(playerId) {
    const room = getPlayerRoom(playerId);
    if (!room) return;

    if (!room.rematch()) {
        const ws = room.sockets.get(playerId);
        if (ws) sendError(ws, 'Cannot start rematch');
    }
}

function handleDisconnect(playerId) {
    const roomCode = playerRooms.get(playerId);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) {
        playerRooms.delete(playerId);
        return;
    }

    room.handleDisconnect(playerId);
    playerRooms.delete(playerId);

    // Clean up empty rooms
    if (room.isEmpty()) {
        if (room.game) room.game.cleanup();
        rooms.delete(roomCode);
    }
}

function getPlayerRoom(playerId) {
    const code = playerRooms.get(playerId);
    return code ? rooms.get(code) : null;
}

function sendError(ws, message) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: S2C.ERROR, message }));
    }
}

// --- Start ---
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Burra server running on http://${HOST}:${PORT}`);
});
