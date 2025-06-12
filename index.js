const PORT = 7777;
let http = require('http');
let static = require('node-static');
let ws = require('ws');

let file = new static.Server('./public');
let http_server = http.createServer(function (request, response) {
  request.addListener('end', function () {
    file.serve(request, response);
  }).resume();
}).listen(PORT);

let ws_server = new ws.Server({ server: http_server });

let player1 = null, player2 = null;
let spectators = [];

function broadcastToSpectators(info) {
  spectators.forEach(s => {
    if (s.readyState === ws.OPEN) s.send(JSON.stringify(info));
  });
}

function sendToAllPlayersAndSpectators(info) {
  let json = JSON.stringify(info);
  if (player1 && player1.readyState === ws.OPEN) player1.send(json);
  if (player2 && player2.readyState === ws.OPEN) player2.send(json);
  broadcastToSpectators(info);
}

ws_server.on('connection', function (conn) {
  if (player1 == null) {
    player1 = conn;
    conn.send(JSON.stringify({ player_num: 1 }));
    conn.on('message', function (msg) {
      if (player2 == null) return;
      let info = JSON.parse(msg);
      if (info.y != null || info.by != null) {
        if (player2.readyState === ws.OPEN) player2.send(JSON.stringify(info));
        broadcastToSpectators(info);
      } else if (info.score1 != null) {
        if (player2.readyState === ws.OPEN) player2.send(JSON.stringify(info));
        broadcastToSpectators(info);
        if (info.score1 >= 3 || info.score2 >= 3) {
          let data = { game_over: true, winner: info.score1 >= 3 ? 1 : 2 };
          sendToAllPlayersAndSpectators(data);
        }
      }
    });
    conn.on('close', () => {
      player1 = null;
      let info = { player_left: 1 };
      if (player2 && player2.readyState === ws.OPEN) player2.send(JSON.stringify(info));
      broadcastToSpectators(info);
    });
  } else if (player2 == null) {
    player2 = conn;
    conn.send(JSON.stringify({ player_num: 2 }));
    setTimeout(() => {
      let info = { game_start: true };
      sendToAllPlayersAndSpectators(info);
    }, 500);
    conn.on('message', function (msg) {
      if (player1 == null) return;
      let info = JSON.parse(msg);
      if (info.y != null) {
        if (player1.readyState === ws.OPEN) player1.send(JSON.stringify(info));
        broadcastToSpectators(info);
      }
    });
    conn.on('close', () => {
      player2 = null;
      let info = { player_left: 2 };
      if (player1 && player1.readyState === ws.OPEN) player1.send(JSON.stringify(info));
      broadcastToSpectators(info);
    });
  } else {
    spectators.push(conn);
    conn.send(JSON.stringify({ spectator: true }));
    conn.on('close', () => {
      spectators = spectators.filter(s => s !== conn);
    });
  }
});
