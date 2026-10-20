// Card DOM element factory
const SUIT_SYMBOLS = {
    hearts: '\u2665',
    diamonds: '\u2666',
    clubs: '\u2663',
    spades: '\u2660',
};

const SUIT_COLORS = {
    hearts: 'red',
    diamonds: 'red',
    clubs: 'black',
    spades: 'black',
};

const CardUI = {
    createCardElement(card, isSelectable) {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.id = card.id;
        el.dataset.suit = card.suit;

        const color = SUIT_COLORS[card.suit];
        el.style.color = color === 'red' ? '#cc0000' : '#1a1a1a';

        el.innerHTML = `
            <div class="card-corner top-left">
                <span class="rank">${card.rank}</span>
                <span class="suit">${SUIT_SYMBOLS[card.suit]}</span>
            </div>
            <div class="card-center">${SUIT_SYMBOLS[card.suit]}</div>
            <div class="card-corner bottom-right">
                <span class="rank">${card.rank}</span>
                <span class="suit">${SUIT_SYMBOLS[card.suit]}</span>
            </div>
        `;

        if (isSelectable) {
            el.classList.add('selectable');
            el.addEventListener('click', () => {
                GameUI.onCardClicked(card.id);
            });
        }

        return el;
    },

    createCardBack() {
        const el = document.createElement('div');
        el.className = 'card-back';
        return el;
    },

    createMiniCardBack() {
        const el = document.createElement('div');
        el.className = 'card-back mini';
        return el;
    },

    setSelected(el, selected) {
        el.classList.toggle('selected', selected);
    },
};
