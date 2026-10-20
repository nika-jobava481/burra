// Game UI controller
const GameUI = (() => {
    let myHand = [];
    let selectedCardIds = [];
    let mySeat = -1;
    let myTeam = -1;
    let isMyTurn = false;
    let currentPhase = '';
    let requiredCardCount = 0;
    let playersInfo = [];

    function init() {
        document.getElementById('btn-play').addEventListener('click', playSelected);
        document.getElementById('btn-declare-bura').addEventListener('click', () => declareBura());
        document.getElementById('btn-declare-maliutka').addEventListener('click', () => declareMaliutka());
        document.getElementById('btn-rematch').addEventListener('click', rematch);

        WS.on(S2C.GAME_STATE, onGameState);
        WS.on(S2C.TRICK_RESULT, onTrickResult);
        WS.on(S2C.DECLARATION, onDeclaration);
        WS.on(S2C.ROUND_OVER, onRoundOver);
        WS.on(S2C.ERROR, onGameError);
    }

    function onGameState(state) {
        // First GAME_STATE switches to game view
        Renderer.showView('game');
        Renderer.hideResultOverlay();

        mySeat = state.mySeat;
        myTeam = state.myTeam;
        myHand = state.hand;
        currentPhase = state.phase;
        requiredCardCount = state.requiredCards || 0;
        isMyTurn = state.currentPlayer === mySeat;
        playersInfo = state.players;

        // Clear selection when state updates
        selectedCardIds = [];

        // Render everything
        Renderer.renderHand(myHand, selectedCardIds);
        Renderer.renderOpponents(state.players, mySeat);
        Renderer.highlightCurrentPlayer(state.currentPlayer, mySeat);
        Renderer.renderTrickArea(state.trick, mySeat);
        Renderer.renderStock(state.stockCount, state.trumpCard);
        Renderer.renderScores(state.scores, mySeat);

        // Status text
        updateStatusText(state);

        // Declaration buttons
        document.getElementById('btn-declare-bura').style.display = state.canDeclareBura ? 'inline-block' : 'none';
        document.getElementById('btn-declare-maliutka').style.display = state.canDeclareMaliutka ? 'inline-block' : 'none';

        // Play button
        updatePlayButton();

        // Set bottom player name
        const myInfo = state.players.find(p => p.seat === mySeat);
        if (myInfo) {
            document.querySelector('#seat-bottom .player-name').textContent = myInfo.name;
        }
    }

    function updateStatusText(state) {
        const currentPlayerInfo = state.players.find(p => p.seat === state.currentPlayer);
        const name = currentPlayerInfo ? currentPlayerInfo.name : '?';

        if (state.phase === 'LEAD') {
            if (isMyTurn) {
                Renderer.renderStatus('Your turn — select cards to lead (all same suit)');
            } else {
                Renderer.renderStatus(`${name} is choosing cards to lead...`);
            }
        } else if (state.phase === 'RESPOND') {
            if (isMyTurn) {
                Renderer.renderStatus(`Your turn — play ${requiredCardCount} card(s) to respond`);
            } else {
                Renderer.renderStatus(`${name} is responding...`);
            }
        } else if (state.phase === 'EVALUATE') {
            Renderer.renderStatus('Evaluating trick...');
        }
    }

    function onCardClicked(cardId) {
        if (!isMyTurn) return;

        const idx = selectedCardIds.indexOf(cardId);
        if (idx >= 0) {
            selectedCardIds.splice(idx, 1);
        } else {
            selectedCardIds.push(cardId);
        }

        // Enforce lead rules: all same suit
        if (currentPhase === 'LEAD' && selectedCardIds.length > 0) {
            const firstCard = myHand.find(c => c.id === selectedCardIds[0]);
            if (firstCard) {
                selectedCardIds = selectedCardIds.filter(id => {
                    const card = myHand.find(c => c.id === id);
                    return card && card.suit === firstCard.suit;
                });
            }
        }

        // Enforce respond rules: exact card count
        if (currentPhase === 'RESPOND' && selectedCardIds.length > requiredCardCount) {
            // Keep only the last N selected
            selectedCardIds = selectedCardIds.slice(-requiredCardCount);
        }

        Renderer.renderHand(myHand, selectedCardIds);
        updatePlayButton();
    }

    function updatePlayButton() {
        const btn = document.getElementById('btn-play');

        if (!isMyTurn || selectedCardIds.length === 0) {
            btn.disabled = true;
            return;
        }

        if (currentPhase === 'LEAD') {
            // Must have at least 1 card, all same suit (already enforced)
            btn.disabled = selectedCardIds.length < 1;
        } else if (currentPhase === 'RESPOND') {
            btn.disabled = selectedCardIds.length !== requiredCardCount;
        } else {
            btn.disabled = true;
        }
    }

    function playSelected() {
        if (selectedCardIds.length === 0) return;
        WS.send(C2S.PLAY_CARDS, { cardIds: [...selectedCardIds] });
        selectedCardIds = [];
        updatePlayButton();
    }

    function declareBura() {
        WS.send(C2S.DECLARE, { declareType: 'BURA' });
    }

    function declareMaliutka() {
        WS.send(C2S.DECLARE, { declareType: 'MALIUTKA' });
    }

    function onTrickResult(result) {
        Renderer.showTrickResult(result.winner, mySeat, result.pointsWon);
    }

    function onDeclaration(msg) {
        const playerInfo = playersInfo.find(p => p.seat === msg.player);
        const name = playerInfo ? playerInfo.name : 'A player';
        Renderer.renderStatus(`${name} declared ${msg.type}!`);
    }

    function onRoundOver(result) {
        let text;
        if (result.winningTeam === -1) {
            text = `Draw! (${result.scores[0]} - ${result.scores[1]})`;
        } else if (result.winningTeam === myTeam) {
            text = `Your team wins! (${result.scores[0]} - ${result.scores[1]})`;
        } else {
            text = `Opponents win! (${result.scores[0]} - ${result.scores[1]})`;
        }
        if (result.reason) {
            text += '\n' + result.reason;
        }
        Renderer.showResultOverlay(text);
    }

    function onGameError(msg) {
        Renderer.renderStatus('Error: ' + msg.message);
    }

    function rematch() {
        WS.send(C2S.REMATCH);
    }

    return { init, onCardClicked };
})();
