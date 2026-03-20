const socket = io(window.location.origin, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 20000,
  path: '/socket.io'
});

const joinScreen = document.getElementById('joinScreen');
const chatScreen = document.getElementById('chatScreen');
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messageWrapper = document.getElementById('messageWrapper');
const statusText = document.getElementById('statusText');
const activeUsersEl = document.getElementById('activeUsers');
const typingIndicator = document.getElementById('typingIndicator');

let username = null;
let typingTimer = null;
let typingUsers = new Set();
let lastSentMessage = '';

function escapeText(value) {
  const node = document.createTextNode(value);
  const span = document.createElement('span');
  span.appendChild(node);
  return span.innerHTML;
}

function scrollToBottom() {
  messageWrapper.scrollTop = messageWrapper.scrollHeight;
}

function renderSystem(text) {
  const notice = document.createElement('div');
  notice.className = 'system';
  notice.textContent = text;
  messageWrapper.appendChild(notice);
  scrollToBottom();
}

function renderMessage(data) {
  const row = document.createElement('div');
  const isMine = data.username === username;
  row.className = `message-row ${isMine ? 'mine' : 'theirs'}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble ${isMine ? 'mine' : 'theirs'}`;

  const msg = document.createElement('div');
  msg.innerHTML = escapeText(data.message);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const who = isMine ? 'You' : escapeText(data.username);
  const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  meta.textContent = `${who} • ${time}`;

  bubble.appendChild(msg);
  bubble.appendChild(meta);
  row.appendChild(bubble);
  messageWrapper.appendChild(row);
  scrollToBottom();
}

function setUserList(list) {
  const count = list.length;
  activeUsersEl.textContent = `${count} user${count === 1 ? '' : 's'} online`;
}

function updateTyping() {
  if (typingUsers.size === 0) return (typingIndicator.textContent = '');
  const names = Array.from(typingUsers).filter((n) => n !== username);
  typingIndicator.textContent = names.length > 0 ? `${names.join(', ')} typing...` : '';
}

function showChat() {
  joinScreen.classList.remove('visible');
  chatScreen.classList.add('visible');
  messageInput.focus();
}

function showError(msg) {
  joinError.textContent = msg;
}

joinBtn.addEventListener('click', () => {
  const value = usernameInput.value.trim();
  if (!value) {
    showError('Please enter a valid username');
    return;
  }

  socket.emit('register-user', value, (response) => {
    if (response && response.success) {
      username = value;
      showChat();
      statusText.textContent = 'Connected';
      setUserList(response.users || []);
      response.history && response.history.forEach(renderMessage);
    } else {
      showError(response?.error || 'Failed to join chat');
    }
  });
});

usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinBtn.click();
  }
});

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!username) return;

  const trimmed = messageInput.value.trim();
  if (trimmed.length === 0) return;

  if (trimmed === lastSentMessage) {
    messageInput.value = '';
    return;
  }

  lastSentMessage = trimmed;
  messageInput.value = '';

  const outgoing = {
    message: trimmed,
    timestamp: Date.now(),
  };

  renderMessage({ ...outgoing, username });

  socket.emit('send-message', outgoing, (ack) => {
    if (!ack || !ack.success) {
      renderSystem('Message could not be delivered.');
    }
  });
});

messageInput.addEventListener('input', () => {
  if (!username) return;
  socket.emit('typing');
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('stop-typing');
  }, 800);
});

socket.on('new-message', (data) => {
  if (data && data.message && data.username && data.timestamp) {
    renderMessage(data);
  }
});

socket.on('user-joined', (name) => {
  renderSystem(`${name} joined the chat`);
});

socket.on('user-left', (name) => {
  renderSystem(`${name} left the chat`);
});

socket.on('active-users', (users) => {
  setUserList(Array.isArray(users) ? users : []);
});

socket.on('typing', (name) => {
  if (name && name !== username) {
    typingUsers.add(name);
    updateTyping();
  }
});

socket.on('stop-typing', (name) => {
  typingUsers.delete(name);
  updateTyping();
});

socket.on('connect', () => {
  statusText.textContent = 'Connected';
});

socket.on('disconnect', () => {
  statusText.textContent = 'Disconnected. Reconnecting…';
  typingIndicator.textContent = '';
});

socket.on('connect_error', (err) => {
  statusText.textContent = 'Connection error: ' + (err.message || 'unknown');
  console.error('Socket connect error', err);
});

socket.on('reconnect_attempt', (count) => {
  statusText.textContent = `Reconnecting... (${count})`;
});

socket.on('reconnect_failed', () => {
  statusText.textContent = 'Reconnection failed, please refresh.';
});
