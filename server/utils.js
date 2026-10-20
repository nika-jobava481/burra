const crypto = require('crypto');

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I or O (avoid confusion with 1/0)

function generateRoomCode(existingRooms) {
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
        }
    } while (existingRooms.has(code));
    return code;
}

function generateId() {
    return crypto.randomUUID();
}

module.exports = { generateRoomCode, generateId };
