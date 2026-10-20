// WebSocket connection manager
const WS = (() => {
    let socket = null;
    const handlers = {};
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;

    function connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${location.host}`);

        socket.onopen = () => {
            reconnectAttempts = 0;
        };

        socket.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            const handler = handlers[msg.type];
            if (handler) handler(msg);
        };

        socket.onclose = () => {
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                const delay = Math.min(1000 * reconnectAttempts, 5000);
                setTimeout(connect, delay);
            }
        };

        socket.onerror = () => {
            // Will trigger onclose
        };
    }

    function send(type, data) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type, ...data }));
        }
    }

    function on(type, callback) {
        handlers[type] = callback;
    }

    return { connect, send, on };
})();
