const { STRENGTH } = require('./Deck');

const TrickEvaluator = {
    /**
     * Can response card R beat lead card L?
     * - Same suit and higher strength, OR
     * - R is trump and L is not trump
     */
    cardBeats(R, L, trumpSuit) {
        if (R.suit === L.suit && STRENGTH[R.rank] > STRENGTH[L.rank]) {
            return true;
        }
        if (R.suit === trumpSuit && L.suit !== trumpSuit) {
            return true;
        }
        return false;
    },

    /**
     * Does the response beat the lead? Uses bipartite matching.
     * Each led card must be beaten by a distinct response card.
     */
    doesResponseBeat(leadCards, responseCards, trumpSuit) {
        const N = leadCards.length;
        if (responseCards.length !== N) return false;

        // Build adjacency: canBeat[i][j] = responseCards[j] can beat leadCards[i]
        const canBeat = [];
        for (let i = 0; i < N; i++) {
            canBeat[i] = [];
            for (let j = 0; j < N; j++) {
                canBeat[i][j] = this.cardBeats(responseCards[j], leadCards[i], trumpSuit);
            }
        }

        const usedResponse = new Array(N).fill(false);
        return this._findMatching(canBeat, usedResponse, 0, N);
    },

    /**
     * Recursive backtracking to find a perfect matching.
     */
    _findMatching(canBeat, usedResponse, leadIdx, N) {
        if (leadIdx === N) return true;

        for (let j = 0; j < N; j++) {
            if (!usedResponse[j] && canBeat[leadIdx][j]) {
                usedResponse[j] = true;
                if (this._findMatching(canBeat, usedResponse, leadIdx + 1, N)) {
                    return true;
                }
                usedResponse[j] = false;
            }
        }
        return false;
    },

    /**
     * Evaluate a complete trick. Returns the seat index of the winner.
     * The leader wins by default. The last clockwise responder who beats
     * the lead takes the trick.
     */
    evaluateTrick(trick, respondOrder, trumpSuit) {
        let winner = trick.leadPlayerIndex;

        for (const seat of respondOrder) {
            const responseCards = trick.responses.get(seat);
            if (this.doesResponseBeat(trick.leadCards, responseCards, trumpSuit)) {
                winner = seat;
            }
        }

        return winner;
    },

    /**
     * Sum point values of a set of cards.
     */
    sumPoints(cards) {
        return cards.reduce((sum, c) => sum + c.points, 0);
    },
};

module.exports = TrickEvaluator;
