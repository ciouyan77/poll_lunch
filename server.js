const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let voting = {
  isOpen: true,
  question: "今天午餐吃什麼？",
  mode: "single",
  options: [
    { id: 0, text: "便當", votes: 0 },
    { id: 1, text: "拉麵", votes: 0 },
    { id: 2, text: "麥當勞", votes: 0 }
  ],
  voters: {}
};

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    players[socket.id] = {
      id: socket.id,
      name: data.name || '同事',
      isHost: data.isHost || false,
      x: (Math.random() - 0.5) * 8,
      z: (Math.random() - 0.5) * 6 + 4,
      color: Math.random() * 0xffffff
    };
    socket.emit('init', { id: socket.id, players, voting });
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  socket.on('move', (pos) => {
    if (players[socket.id]) {
      players[socket.id].x = pos.x;
      players[socket.id].z = pos.z;
      socket.broadcast.emit('playerMoved', { id: socket.id, x: pos.x, z: pos.z });
    }
  });

  socket.on('clap', () => {
    io.emit('playerClapped', { id: socket.id });
  });

  socket.on('swing', () => {
    socket.broadcast.emit('playerAttackSwing', { id: socket.id });
  });

  socket.on('punch', ({ targetId, knockbackX, knockbackZ }) => {
    if (targetId && players[targetId]) {
      io.emit('playerHit', { targetId, knockbackX, knockbackZ });
    }
  });

  // 聊天訊息廣播
  socket.on('chat', (msg) => {
    const text = String(msg || '').trim().slice(0, 40);
    if (text) {
      io.emit('playerChat', { id: socket.id, text });
    }
  });

  // 主持人改題
  socket.on('hostSetVote', (newVoting) => {
    if (players[socket.id]?.isHost) {
      voting = {
        isOpen: true,
        question: newVoting.question,
        mode: newVoting.mode,
        options: newVoting.options.map((t, idx) => ({ id: idx, text: t, votes: 0 })),
        voters: {}
      };
      io.emit('voteUpdated', voting);
    }
  });

  // 投票
  socket.on('castVote', (selectedIds) => {
    if (!voting.isOpen) return;
    voting.voters[socket.id] = selectedIds.map(Number);

    voting.options.forEach(opt => { opt.votes = 0; });
    Object.values(voting.voters).forEach(ids => {
      ids.forEach(id => {
        const target = voting.options.find(o => Number(o.id) === Number(id));
        if (target) target.votes += 1;
      });
    });

    io.emit('voteUpdated', voting);
    socket.emit('voteSuccess');
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    delete voting.voters[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server on port ${PORT}`));