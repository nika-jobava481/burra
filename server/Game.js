const { Deck } = require('./Deck');
const TrickEvaluator = require('./TrickEvaluator');
const { PHASE } = require('./protocol');

class Game {
    constructor(players, onStateChange, onTrickResult, onRoundOver) {
        this.players = players; // Array of 4 Player objects (indexed by seat)
        this.onStateChange = onStateChange;
        this.onTrickResult = onTrickResult;
        this.onRoundOver = onRoundOver;

        this.deck = null;
        this.trumpCard = null;
        this.trumpSuit = null;
        this.stock = [];
        this.currentPlayerIndex = 0; // seat index of whose turn it is
        this.phase = PHASE.DEAL;
        this.trick = null;
        this.teamScores = [0, 0];
        this.trickTimer = null;
    }

    start() {
        this.deal();
    }

    deal() {
        this.deck = new Deck();
        this.deck.shuffle();

        // Deal 5 cards to each player
        for (let round = 0; round < 5; round++) {
            for (let i = 0; i < 4; i++) {
                this.players[i].hand.push(this.deck.draw());
            }
        }

        // Trump card: next card from deck, placed at bottom of stock
        this.trumpCard = this.deck.draw();
        this.trumpSuit = this.trumpCard.suit;

        // Remaining cards become stock, trump card goes last (drawn last)
        this.stock = [];
        while (this.deck.size > 0) {
            this.stock.push(this.deck.draw());
        }
        this.stock.push(this.trumpCard);

        // Check for immediate declarations
        this.phase = PHASE.LEAD;
        this.currentPlayerIndex = 0;
        this.trick = null;

        this.onStateChange();
    }

    getPlayer(playerId) {
        return this.players.find(p => p.id === playerId);
    }

    getPlayerBySeat(seat) {
        return this.players[seat];
    }

    currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    /**
     * Validate and execute a play-cards action.
     * Returns { valid, error? }
     */
    playCards(playerId, cardIds) {
        const player = this.getPlayer(playerId);
        if (!player) return { valid: false, error: 'Player not found' };

        // Must be this player's turn
        if (player.seatIndex !== this.currentPlayerIndex) {
            return { valid: false, error: 'Not your turn' };
        }

        // Player must have the cards
        if (!player.hasCards(cardIds)) {
            return { valid: false, error: 'You don\'t have those cards' };
        }

        if (this.phase === PHASE.LEAD) {
            return this._handleLead(player, cardIds);
        } else if (this.phase === PHASE.RESPOND) {
            return this._handleRespond(player, cardIds);
        }

        return { valid: false, error: 'Cannot play cards in this phase' };
    }

    _handleLead(player, cardIds) {
        if (cardIds.length < 1 || cardIds.length > 5) {
            return { valid: false, error: 'Must play 1-5 cards' };
        }

        const cards = player.getCards(cardIds);

        // All lead cards must be the same suit
        const suit = cards[0].suit;
        if (!cards.every(c => c.suit === suit)) {
            return { valid: false, error: 'All lead cards must be the same suit' };
        }

        // Remove cards from hand
        player.removeCards(cardIds);

        // Set up the trick
        const respondOrder = [];
        for (let i = 1; i <= 3; i++) {
            respondOrder.push((player.seatIndex + i) % 4);
        }

        this.trick = {
            leadCards: cards,
            leadPlayerIndex: player.seatIndex,
            responses: new Map(),
            respondOrder,
            currentResponderIdx: 0,
        };

        // Move to respond phase
        this.phase = PHASE.RESPOND;
        this.currentPlayerIndex = respondOrder[0];

        this.onStateChange();
        return { valid: true };
    }

    _handleRespond(player, cardIds) {
        const requiredCount = this.trick.leadCards.length;
        if (cardIds.length !== requiredCount) {
            return { valid: false, error: `Must play exactly ${requiredCount} card(s)` };
        }

        const cards = player.getCards(cardIds);
        player.removeCards(cardIds);

        // Store the response
        this.trick.responses.set(player.seatIndex, cards);
        this.trick.currentResponderIdx++;

        // Check if all responders have played
        if (this.trick.currentResponderIdx >= this.trick.respondOrder.length) {
            this._evaluateTrick();
        } else {
            // Next responder's turn
            this.currentPlayerIndex = this.trick.respondOrder[this.trick.currentResponderIdx];
            this.onStateChange();
        }

        return { valid: true };
    }

    _evaluateTrick() {
        this.phase = PHASE.EVALUATE;

        const winnerSeat = TrickEvaluator.evaluateTrick(
            this.trick,
            this.trick.respondOrder,
            this.trumpSuit
        );

        // Gather all cards from the trick
        const allTrickCards = [...this.trick.leadCards];
        for (const cards of this.trick.responses.values()) {
            allTrickCards.push(...cards);
        }

        const pointsWon = TrickEvaluator.sumPoints(allTrickCards);
        const winnerTeam = this.players[winnerSeat].team;
        this.teamScores[winnerTeam] += pointsWon;

        // Build trick result for broadcast
        const trickResult = {
            winner: winnerSeat,
            winnerTeam,
            leadCards: this.trick.leadCards,
            responses: {},
            pointsWon,
            scores: [...this.teamScores],
        };
        for (const [seat, cards] of this.trick.responses) {
            trickResult.responses[seat] = cards;
        }

        // Notify about trick result
        this.onTrickResult(trickResult);

        // After a delay, proceed to draw/next trick
        this.trickTimer = setTimeout(() => {
            this._afterTrickResult(winnerSeat);
        }, 2000);
    }

    _afterTrickResult(winnerSeat) {
        // Check if round is over
        if (this.teamScores[0] >= 61 || this.teamScores[1] >= 61) {
            this._endRound();
            return;
        }

        // Check if all cards exhausted (stock empty + all hands empty)
        const allHandsEmpty = this.players.every(p => p.hand.length === 0);
        if (allHandsEmpty && this.stock.length === 0) {
            this._endRound();
            return;
        }

        // Draw phase: refill hands from stock
        this._drawCards(winnerSeat);

        // Next trick: winner leads
        this.currentPlayerIndex = winnerSeat;
        this.trick = null;
        this.phase = PHASE.LEAD;

        this.onStateChange();
    }

    _drawCards(trickWinnerSeat) {
        if (this.stock.length === 0) return;

        // Draw order: winner first, then clockwise
        for (let i = 0; i < 4; i++) {
            const seat = (trickWinnerSeat + i) % 4;
            const player = this.players[seat];
            while (player.hand.length < 5 && this.stock.length > 0) {
                player.hand.push(this.stock.shift());
            }
        }
    }

    _endRound() {
        this.phase = PHASE.ROUND_OVER;

        let winningTeam = -1;
        let reason = '';

        if (this.teamScores[0] >= 61 && this.teamScores[1] >= 61) {
            // Both over 61 — the one with more wins
            if (this.teamScores[0] > this.teamScores[1]) {
                winningTeam = 0;
                reason = 'Team A scored more points';
            } else if (this.teamScores[1] > this.teamScores[0]) {
                winningTeam = 1;
                reason = 'Team B scored more points';
            } else {
                winningTeam = -1;
                reason = 'Draw — both teams tied';
            }
        } else if (this.teamScores[0] >= 61) {
            winningTeam = 0;
            reason = 'Team A reached 61 points';
        } else if (this.teamScores[1] >= 61) {
            winningTeam = 1;
            reason = 'Team B reached 61 points';
        } else if (this.teamScores[0] === 60 && this.teamScores[1] === 60) {
            winningTeam = -1;
            reason = 'Draw — both teams have 60 points';
        } else {
            // All cards played, neither reached 61
            if (this.teamScores[0] > this.teamScores[1]) {
                winningTeam = 0;
                reason = 'Team A has more points';
            } else if (this.teamScores[1] > this.teamScores[0]) {
                winningTeam = 1;
                reason = 'Team B has more points';
            } else {
                winningTeam = -1;
                reason = 'Draw';
            }
        }

        this.onRoundOver({
            winningTeam,
            scores: [...this.teamScores],
            reason,
        });
    }

    /**
     * Handle a declaration (Bura or Maliutka).
     * Can only be declared at the start of LEAD phase by the current player.
     */
    declare(playerId, type) {
        const player = this.getPlayer(playerId);
        if (!player) return { valid: false, error: 'Player not found' };

        if (player.seatIndex !== this.currentPlayerIndex) {
            return { valid: false, error: 'Not your turn' };
        }

        if (this.phase !== PHASE.LEAD) {
            return { valid: false, error: 'Can only declare at the start of your turn' };
        }

        if (player.hand.length !== 5) {
            return { valid: false, error: 'Must have 5 cards to declare' };
        }

        if (type === 'BURA') {
            const allTrump = player.hand.every(c => c.suit === this.trumpSuit);
            if (!allTrump) {
                return { valid: false, error: 'Not all cards are trump' };
            }
            return {
                valid: true,
                declaration: {
                    type: 'BURA',
                    player: player.seatIndex,
                    cards: [...player.hand],
                    winningTeam: player.team,
                    reason: `${player.name} declared Bura!`,
                },
            };
        }

        if (type === 'MALIUTKA') {
            const allZero = player.hand.every(c => c.points === 0);
            if (!allZero) {
                return { valid: false, error: 'Not all cards are zero-point' };
            }
            return {
                valid: true,
                declaration: {
                    type: 'MALIUTKA',
                    player: player.seatIndex,
                    cards: [...player.hand],
                    winningTeam: player.team,
                    reason: `${player.name} declared Maliutka!`,
                },
            };
        }

        return { valid: false, error: 'Unknown declaration type' };
    }

    /**
     * Build per-player filtered game state.
     * Only includes that player's own hand cards.
     */
    getStateForPlayer(playerId) {
        const player = this.getPlayer(playerId);
        if (!player) return null;

        const state = {
            phase: this.phase,
            hand: player.hand.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, points: c.points, strength: c.strength })),
            trumpCard: this.trumpCard ? { id: this.trumpCard.id, rank: this.trumpCard.rank, suit: this.trumpCard.suit } : null,
            trumpSuit: this.trumpSuit,
            stockCount: this.stock.length,
            currentPlayer: this.currentPlayerIndex,
            requiredCards: this.trick ? this.trick.leadCards.length : 0,
            trick: this._getTrickView(),
            players: this.players.map(p => p.toPublic()),
            scores: [...this.teamScores],
            mySeat: player.seatIndex,
            myTeam: player.team,
        };

        // Check if player can declare
        state.canDeclareBura = this.phase === PHASE.LEAD
            && player.seatIndex === this.currentPlayerIndex
            && player.hand.length === 5
            && player.hand.every(c => c.suit === this.trumpSuit);

        state.canDeclareMaliutka = this.phase === PHASE.LEAD
            && player.seatIndex === this.currentPlayerIndex
            && player.hand.length === 5
            && player.hand.every(c => c.points === 0);

        return state;
    }

    _getTrickView() {
        if (!this.trick) return null;

        const view = {
            leader: this.trick.leadPlayerIndex,
            leadCards: this.trick.leadCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, points: c.points })),
            responses: {},
            pendingResponders: [],
        };

        for (const [seat, cards] of this.trick.responses) {
            view.responses[seat] = cards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, points: c.points }));
        }

        // Which responders haven't played yet
        for (let i = this.trick.currentResponderIdx; i < this.trick.respondOrder.length; i++) {
            view.pendingResponders.push(this.trick.respondOrder[i]);
        }

        return view;
    }

    cleanup() {
        if (this.trickTimer) {
            clearTimeout(this.trickTimer);
            this.trickTimer = null;
        }
    }
}

module.exports = Game;
