// Lobby UI: create/join rooms, waiting room
const Lobby = (() => {
    let currentRoomCode = null;
    let isHost = false;

    function init() {
        document.getElementById('btn-create').addEventListener('click', createRoom);
        document.getElementById('btn-join').addEventListener('click', joinRoom);
        document.getElementById('btn-start').addEventListener('click', startGame);

        // Allow Enter key in inputs
        document.getElementById('player-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (document.getElementById('room-code-input').value) {
                    joinRoom();
                } else {
                    createRoom();
                }
            }
        });
        document.getElementById('room-code-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') joinRoom();
        });

        // WS handlers for lobby
        WS.on(S2C.ROOM_CREATED, onRoomCreated);
        WS.on(S2C.ROOM_JOINED, onRoomJoined);
        WS.on(S2C.PLAYER_JOINED, onPlayerJoined);
        WS.on(S2C.PLAYER_LEFT, onPlayerLeft);
        WS.on(S2C.ERROR, onError);
    }

    function createRoom() {
        const name = document.getElementById('player-name').value.trim();
        if (!name) {
            showError('Please enter your name');
            return;
        }
        WS.send(C2S.CREATE_ROOM, { name });
    }

    function joinRoom() {
        const name = document.getElementById('player-name').value.trim();
        const code = document.getElementById('room-code-input').value.trim().toUpperCase();
        if (!name) {
            showError('Please enter your name');
            return;
        }
        if (!code) {
            showError('Please enter a room code');
            return;
        }
        WS.send(C2S.JOIN_ROOM, { name, roomCode: code });
    }

    function startGame() {
        WS.send(C2S.START_GAME);
    }

    function onRoomCreated(msg) {
        currentRoomCode = msg.roomCode;
        isHost = msg.isHost;
        showWaitingRoom(msg.roomCode, msg.players);
    }

    function onRoomJoined(msg) {
        currentRoomCode = msg.roomCode;
        isHost = msg.isHost;
        showWaitingRoom(msg.roomCode, msg.players);

        if (msg.reconnected) {
            // Reconnected to in-progress game — game state will follow
            Renderer.showView('game');
        }
    }

    function onPlayerJoined(msg) {
        updatePlayerSlot(msg.seat, msg.name, msg.team);
        updateStartButton();
    }

    function onPlayerLeft(msg) {
        if (msg.remainingPlayers) {
            renderPlayerList(msg.remainingPlayers);
        }
        updateStartButton();
    }

    function showWaitingRoom(code, players) {
        document.getElementById('room-actions').style.display = 'none';
        document.getElementById('name-section').style.display = 'none';
        document.getElementById('waiting-room').style.display = 'block';
        document.getElementById('room-code-display').textContent = code;

        renderPlayerList(players);
        updateStartButton();
    }

    function renderPlayerList(players) {
        const list = document.getElementById('player-list');
        list.innerHTML = '';

        for (let i = 0; i < 4; i++) {
            const slot = document.createElement('div');
            slot.className = 'player-slot';
            slot.id = `slot-${i}`;

            const player = players.find(p => p.seat === i);
            if (player) {
                const teamLabel = i % 2 === 0 ? 'Team A' : 'Team B';
                slot.innerHTML = `
                    <span class="slot-name">${player.name}</span>
                    <span class="slot-team ${i % 2 === 0 ? 'team-a' : 'team-b'}">${teamLabel}</span>
                `;
                slot.classList.add('occupied');
            } else {
                slot.innerHTML = '<span class="slot-empty">Waiting for player...</span>';
            }

            list.appendChild(slot);
        }
    }

    function updatePlayerSlot(seat, name, team) {
        const slot = document.getElementById(`slot-${seat}`);
        if (!slot) return;
        const teamLabel = seat % 2 === 0 ? 'Team A' : 'Team B';
        slot.innerHTML = `
            <span class="slot-name">${name}</span>
            <span class="slot-team ${seat % 2 === 0 ? 'team-a' : 'team-b'}">${teamLabel}</span>
        `;
        slot.classList.add('occupied');
    }

    function updateStartButton() {
        const btn = document.getElementById('btn-start');
        const slots = document.querySelectorAll('.player-slot.occupied');
        btn.style.display = isHost && slots.length === 4 ? 'block' : 'none';
    }

    function onError(msg) {
        showError(msg.message);
    }

    function showError(text) {
        // Show temporary error message
        let errorEl = document.getElementById('error-msg');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'error-msg';
            errorEl.className = 'error-message';
            document.getElementById('lobby-view').appendChild(errorEl);
        }
        errorEl.textContent = text;
        errorEl.style.display = 'block';
        setTimeout(() => { errorEl.style.display = 'none'; }, 3000);
    }

    return { init };
})();
