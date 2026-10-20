// Entry point: initialize WS connection, lobby, and game modules
(function () {
    WS.connect();
    Lobby.init();
    GameUI.init();
})();
