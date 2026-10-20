const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const POINTS = { '6': 0, '7': 0, '8': 0, '9': 0, '10': 10, 'J': 2, 'Q': 3, 'K': 4, 'A': 11 };
const STRENGTH = { '6': 0, '7': 1, '8': 2, '9': 3, 'J': 4, 'Q': 5, 'K': 6, '10': 7, 'A': 8 };

class Deck {
    constructor() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push({
                    id: `${rank}_${suit}`,
                    rank,
                    suit,
                    points: POINTS[rank],
                    strength: STRENGTH[rank],
                });
            }
        }
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw() {
        return this.cards.pop();
    }

    get size() {
        return this.cards.length;
    }
}

module.exports = { Deck, SUITS, RANKS, POINTS, STRENGTH };
