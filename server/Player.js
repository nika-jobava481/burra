class Player {
    constructor(id, name, seatIndex) {
        this.id = id;
        this.name = name;
        this.seatIndex = seatIndex;
        this.team = seatIndex % 2; // 0 = Team A (seats 0,2), 1 = Team B (seats 1,3)
        this.hand = [];
        this.connected = true;
        this.reconnectTimer = null;
    }

    hasCards(cardIds) {
        return cardIds.every(id => this.hand.some(c => c.id === id));
    }

    getCards(cardIds) {
        return cardIds.map(id => this.hand.find(c => c.id === id));
    }

    removeCards(cardIds) {
        this.hand = this.hand.filter(c => !cardIds.includes(c.id));
    }

    toPublic() {
        return {
            seat: this.seatIndex,
            name: this.name,
            cardCount: this.hand.length,
            connected: this.connected,
            team: this.team,
        };
    }
}

module.exports = Player;
