const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 8000;
const users = new Map();
const history = [];

app.use(express.static(__dirname));

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  socket.on('register-user', (name, cb) => {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return cb({ success: false, error: 'Invalid username' });
    }

    name = name.trim();
    if ([...users.values()].includes(name)) {
      return cb({ success: false, error: 'Username already taken' });
    }

    users.set(socket.id, name);
    socket.username = name;

    const userList = [...users.values()];
    socket.emit('active-users', userList);
    socket.broadcast.emit('user-joined', name);
    io.emit('active-users', userList);

    cb({ success: true, users: userList, history });
  });

  socket.on('send-message', (payload, cb) => {
    if (!socket.username) return cb && cb({ success: false, error: 'Not registered' });
    if (!payload || !payload.message || typeof payload.message !== 'string') {
      return cb && cb({ success: false, error: 'Invalid message' });
    }

    const messageData = {
      username: socket.username,
      message: payload.message.trim(),
      timestamp: Date.now()
    };

    history.push(messageData);
    if (history.length > 200) history.shift();

    io.emit('new-message', messageData);
    cb && cb({ success: true });
  });

  socket.on('typing', () => {
    if (!socket.username) return;
    socket.broadcast.emit('typing', socket.username);
  });

  socket.on('stop-typing', () => {
    if (!socket.username) return;
    socket.broadcast.emit('stop-typing', socket.username);
  });

  socket.on('disconnect', () => {
    const name = users.get(socket.id);
    users.delete(socket.id);
    if (name) {
      io.emit('user-left', name);
      io.emit('active-users', [...users.values()]);
    }
    console.log('Socket disconnected', socket.id, name || '(no user)');
  });
});

server.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
