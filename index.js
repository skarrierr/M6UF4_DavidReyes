const PORT = 7777;
const http = require('http');
const static = require('node-static');
const WebSocket = require('ws');

const fileServer = new static.Server('./public');
const httpServer = http.createServer((req, res) => {
  req.addListener('end', () => fileServer.serve(req, res)).resume();
});
httpServer.listen(PORT, () => console.log(`Escuchando en puerto ${PORT}`));

const wss = new WebSocket.Server({ server: httpServer });

let player1 = null;
let player2 = null;
let spectators = [];

function broadcastToSpectators(info) {
  const msg = JSON.stringify(info);
  spectators.forEach(s => {
    if (s.readyState === WebSocket.OPEN) s.send(msg);
  });
}

wss.on('connection', ws => {
  let role;
  if (!player1) {
    player1 = ws;
    role = 1;
  } else if (!player2) {
    player2 = ws;
    role = 2;
  } else {
    spectators.push(ws);
    role = 0;
  }

  ws.send(JSON.stringify({ player_num: role }));

  if (player1 && player2) {
    const startMsg = JSON.stringify({ game_start: true });
    [player1, player2, ...spectators].forEach(c => {
      if (c.readyState === WebSocket.OPEN) c.send(startMsg);
    });
  }

  ws.on('message', raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === 'p1' && player2) {
      const msg = { player1_y: data.y };
      player2.send(JSON.stringify(msg));
      broadcastToSpectators(msg);
    } else if (data.type === 'p2' && player1) {
      const msg = { player2_y: data.y };
      player1.send(JSON.stringify(msg));
      broadcastToSpectators(msg);
    } else if (data.bx != null && data.by != null) {
      const msg = { bx: data.bx, by: data.by };
      if (player2) player2.send(raw);
      broadcastToSpectators(msg);
    } else if (data.score1 != null && data.score2 != null) {
      const msg = { score1: data.score1, score2: data.score2 };
      [player1, player2].forEach(c => {
        if (c && c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
      });
      broadcastToSpectators(msg);
      if (data.score1 >= 3 || data.score2 >= 3) {
        const winner = data.score1 > data.score2 ? 1 : 2;
        const gameOver = { game_over: true, winner };
        const specMsg = { game_over: true, spectator_msg: `Ha ganado el jugador ${winner}` };
        [player1, player2].forEach(c => {
          if (c && c.readyState === WebSocket.OPEN) c.send(JSON.stringify(gameOver));
        });
        spectators.forEach(s => {
          if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify(specMsg));
        });
      }
    }
  });

  ws.on('close', () => {
    if (role === 1) player1 = null;
    else if (role === 2) player2 = null;
    else spectators = spectators.filter(s => s !== ws);

    const info = { disconnected: true, player_num: role };
    [player1, player2].forEach(c => {
      if (c && c.readyState === WebSocket.OPEN) c.send(JSON.stringify(info));
    });
    broadcastToSpectators(info);
  });
});
