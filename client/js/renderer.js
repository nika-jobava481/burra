// DOM manipulation for the game table
const Renderer = {
    seatToPosition(absoluteSeat, mySeat) {
        const relative = (absoluteSeat - mySeat + 4) % 4;
        return ['bottom', 'left', 'top', 'right'][relative];
    },

    renderHand(cards, selectedIds) {
        const container = document.getElementById('my-hand');
        container.innerHTML = '';
        cards.forEach(card => {
            const el = CardUI.createCardElement(card, true);
            if (selectedIds.includes(card.id)) {
                CardUI.setSelected(el, true);
            }
            container.appendChild(el);
        });
    },

    renderOpponents(playersInfo, mySeat) {
        // Clear all opponent areas first
        ['top', 'left', 'right'].forEach(pos => {
            const area = document.getElementById(`seat-${pos}`);
            area.querySelector('.player-name').textContent = '';
            area.querySelector('.card-backs').innerHTML = '';
            area.classList.remove('active-turn', 'disconnected');
            const teamBadge = area.querySelector('.team-badge');
            if (teamBadge) teamBadge.textContent = '';
        });

        for (const p of playersInfo) {
            if (p.seat === mySeat) continue;
            const position = this.seatToPosition(p.seat, mySeat);
            const area = document.getElementById(`seat-${position}`);
            const nameEl = area.querySelector('.player-name');
            const cardsEl = area.querySelector('.card-backs');
            const teamBadge = area.querySelector('.team-badge');

            nameEl.textContent = p.name;
            if (!p.connected) {
                area.classList.add('disconnected');
                nameEl.textContent = p.name + ' (disconnected)';
            }

            if (teamBadge) {
                const myTeam = mySeat % 2;
                teamBadge.textContent = p.team === myTeam ? 'Ally' : 'Opponent';
                teamBadge.className = 'team-badge ' + (p.team === myTeam ? 'ally' : 'opponent');
            }

            cardsEl.innerHTML = '';
            for (let i = 0; i < p.cardCount; i++) {
                cardsEl.appendChild(CardUI.createMiniCardBack());
            }
        }
    },

    highlightCurrentPlayer(currentPlayer, mySeat) {
        // Remove all highlights
        document.querySelectorAll('.player-area').forEach(el => el.classList.remove('active-turn'));

        if (currentPlayer === mySeat) {
            document.getElementById('seat-bottom').classList.add('active-turn');
        } else {
            const pos = this.seatToPosition(currentPlayer, mySeat);
            document.getElementById(`seat-${pos}`).classList.add('active-turn');
        }
    },

    renderTrickArea(trick, mySeat) {
        const area = document.getElementById('trick-area');
        area.innerHTML = '';

        if (!trick) return;

        // Show lead cards
        if (trick.leadCards && trick.leadCards.length > 0) {
            const pos = this.seatToPosition(trick.leader, mySeat);
            const group = document.createElement('div');
            group.className = `trick-group trick-${pos}`;
            group.dataset.player = trick.leader;

            trick.leadCards.forEach(c => {
                group.appendChild(CardUI.createCardElement(c, false));
            });
            area.appendChild(group);
        }

        // Show responses
        if (trick.responses) {
            for (const [seat, cards] of Object.entries(trick.responses)) {
                const seatNum = parseInt(seat);
                const pos = this.seatToPosition(seatNum, mySeat);
                const group = document.createElement('div');
                group.className = `trick-group trick-${pos}`;
                group.dataset.player = seatNum;

                cards.forEach(c => {
                    group.appendChild(CardUI.createCardElement(c, false));
                });
                area.appendChild(group);
            }
        }
    },

    renderStock(count, trumpCard) {
        const countEl = document.getElementById('stock-count');
        countEl.textContent = count > 0 ? count : '';

        const stockPile = document.getElementById('stock-pile');
        if (count > 0) {
            stockPile.style.display = 'flex';
        } else {
            stockPile.style.display = 'none';
        }

        const trumpEl = document.getElementById('trump-display');
        trumpEl.innerHTML = '';
        if (trumpCard) {
            const cardEl = CardUI.createCardElement(trumpCard, false);
            cardEl.classList.add('trump-indicator');
            trumpEl.appendChild(cardEl);

            const label = document.createElement('div');
            label.className = 'trump-label';
            label.textContent = 'Trump';
            trumpEl.appendChild(label);
        }
    },

    renderScores(scores, mySeat) {
        const myTeam = mySeat % 2;
        document.getElementById('score-mine').textContent = scores[myTeam];
        document.getElementById('score-theirs').textContent = scores[1 - myTeam];
    },

    renderStatus(text) {
        document.getElementById('status-bar').textContent = text;
    },

    showTrickResult(winner, mySeat, pointsWon) {
        const pos = this.seatToPosition(winner, mySeat);
        const statusText = `Trick won by ${pos === 'bottom' ? 'You' : pos} (+${pointsWon} pts)`;
        this.renderStatus(statusText);

        // Highlight winning cards
        const trickGroups = document.querySelectorAll('.trick-group');
        trickGroups.forEach(group => {
            if (parseInt(group.dataset.player) === winner) {
                group.classList.add('trick-winner');
            }
        });
    },

    showView(viewId) {
        document.getElementById('lobby-view').style.display = viewId === 'lobby' ? 'flex' : 'none';
        document.getElementById('game-view').style.display = viewId === 'game' ? 'block' : 'none';
    },

    showResultOverlay(text) {
        const overlay = document.getElementById('result-overlay');
        document.getElementById('result-text').textContent = text;
        overlay.style.display = 'flex';
    },

    hideResultOverlay() {
        document.getElementById('result-overlay').style.display = 'none';
    },
};
