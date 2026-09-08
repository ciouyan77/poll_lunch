const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let voting = {
  isOpen: false,
  question: "今天午餐吃什麼？",
  mode: "single", // single or multiple
  options: [
    { id: 1, text: "便當", votes: 0 },
    { id: 2, text: "拉麵", votes: 0 },
    { id: 3, text: "麥當勞", votes: 0 }
  ],
  voters: {}
};

io.on('connection', (socket) => {
  // 玩家加入
  socket.on('join', (data) => {
    players[socket.id] = {
      id: socket.id,
      name: data.name || '同事',
      isHost: data.isHost || false,
      x: (Math.random() - 0.5) * 10,
      z: (Math.random() - 0.5) * 10 + 5,
      color: Math.random() * 0xffffff
    };
    socket.emit('init', { id: socket.id, players, voting });
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  // 移動同步
  socket.on('move', (pos) => {
    if (players[socket.id]) {
      players[socket.id].x = pos.x;
      players[socket.id].z = pos.z;
      socket.broadcast.emit('playerMoved', { id: socket.id, x: pos.x, z: pos.z });
    }
  });

  // 拍手事件
  socket.on('clap', () => {
    io.emit('playerClapped', { id: socket.id });
  });

  // 攻擊事件 (廣播被揍者 ID)
  socket.on('punch', (targetId) => {
    if (targetId) {
      io.emit('playerHit', { targetId, attackerId: socket.id });
    }
  });

  // 主持人更新投票題目
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

  // 投票提交
  socket.on('castVote', (selectedIds) => {
    if (!voting.isOpen) return;
    voting.voters[socket.id] = selectedIds;
    // 重計票數
    voting.options.forEach(opt => opt.votes = 0);
    Object.values(voting.voters).forEach(ids => {
      ids.forEach(id => {
        const opt = voting.options.find(o => o.id === id);
        if (opt) opt.votes++;
      });
    });
    io.emit('voteUpdated', voting);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    delete voting.voters[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));