// chat-server.js
// ─────────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// ░░ НАСТРОЙКИ ░░
const PORT        = 8082;
const DATA_FOLDER = path.join(__dirname, 'chat-data');   // можно изменить
if (!fs.existsSync(DATA_FOLDER)) fs.mkdirSync(DATA_FOLDER, { recursive: true });

const GROUPS_DATA_FILE = path.join(DATA_FOLDER, 'chat-groups.json');
let groups = fs.existsSync(GROUPS_DATA_FILE) ? JSON.parse(fs.readFileSync(GROUPS_DATA_FILE, 'utf8')) : {};

function saveGroups() {
  fs.writeFileSync(GROUPS_DATA_FILE, JSON.stringify(groups), 'utf8');
}

const CHAT_DATA_FILE  = path.join(DATA_FOLDER, 'chat-history.json');
const USERS_DATA_FILE = path.join(DATA_FOLDER, 'chat-users.json');

// ░░ ЗАГРУЗКА ░░
let chats      = fs.existsSync(CHAT_DATA_FILE)  ? JSON.parse(fs.readFileSync(CHAT_DATA_FILE , 'utf8')) : {};
let savedUsers = fs.existsSync(USERS_DATA_FILE) ? JSON.parse(fs.readFileSync(USERS_DATA_FILE, 'utf8')) : {};

function saveChats()      { fs.writeFileSync(CHAT_DATA_FILE , JSON.stringify(chats)     , 'utf8'); }
function saveUsers()      { fs.writeFileSync(USERS_DATA_FILE, JSON.stringify(savedUsers), 'utf8'); }

const wss   = new WebSocketServer({ port: PORT });
const peers = new Map();           // ws -> nick

// ░░ УТИЛИТЫ ░░
function broadcastUsers() {
  const usersPayload = JSON.stringify({ 
    type: 'users', 
    list: Object.keys(savedUsers)  // Только реальные пользователи
  });

  const groupsPayload = JSON.stringify({
    type: 'groups',
    groups  // Это отдельно группы
  });

  peers.forEach((_, sock) => {
    if (sock.readyState === 1) {
      sock.send(usersPayload);
      sock.send(groupsPayload);
    }
  });
}


function pushToHistory(key, obj) {
  if (!chats[key]) chats[key] = [];
  chats[key].push(obj);
  saveChats();
}

function sendHistory(ws, nick) {
  Object.entries(chats).forEach(([key, messages]) => {
    if (key.includes(nick)) {
      const peer = key.split('|').find(u => u !== nick);
      ws.send(JSON.stringify({ type: 'history', peer, history: messages }));
    }
  });
}

function handleGroupFileMessage({ groupName, name, mime, data, fileId }, nick) {
  if (!groups[groupName]) return;

  if (!chats[groupName]) chats[groupName] = [];

  const isDuplicate = chats[groupName].some(item =>
    item.file &&
    item.file.name === name &&
    item.file.mime === mime &&
    item.file.data === data &&
    item.from === nick
  );

  if (!isDuplicate) {
    chats[groupName].push({ from: nick, fileId, file: { name, mime, data } });
    saveChats();
  }

  const sentTo = new Set();

  peers.forEach((peerNick, sock) => {
    if (groups[groupName].members.includes(peerNick) && sock.readyState === 1 && !sentTo.has(peerNick)) {
      sock.send(JSON.stringify({
        type: 'group-file',
        groupName,
        from: nick,
        name,
        mime,
        data,
        fileId
      }));
      sentTo.add(peerNick);
    }
  });
}

// ░░ ЛОГИКА ░░
wss.on('connection', ws => {
  let nick = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      nick = String(msg.nick || '').trim().slice(0, 20);
      if (!nick) return;
      peers.set(ws, nick);
      savedUsers[nick] = true; saveUsers();

      broadcastUsers();
      sendHistory(ws, nick);
      return;
    }

    if (!nick) return;                          // не авторизован

    if (msg.type === 'msg') {
      const key = [nick, msg.to].sort().join('|');
      pushToHistory(key, { from: nick, to: msg.to, text: msg.text });

      peers.forEach((peerNick, sock) => {
        if ((peerNick === msg.to || peerNick === nick) && sock.readyState === 1) {
          sock.send(JSON.stringify({ type: 'msg', from: nick, text: msg.text }));
        }
      });
    }

    if (msg.type === 'file') {
      const key = [nick, msg.to].sort().join('|');
      pushToHistory(key, {
        from: nick,
        to  : msg.to,
        file: { name: msg.name, mime: msg.mime, data: msg.data }
      });

      peers.forEach((peerNick, sock) => {
        if ((peerNick === msg.to || peerNick === nick) && sock.readyState === 1) {
          sock.send(JSON.stringify({ type: 'file',
                                     from: nick,
                                     name: msg.name, mime: msg.mime, data: msg.data }));
        }
      });
    }

    if (msg.type === 'create-group') {
      const { groupName, members } = msg;
      groups[groupName] = { members };
      saveGroups();
      broadcastUsers();
    }

    // Клиент сообщает, что открыл группу и хочет в неё вступить
    if (msg.type === 'send-group-msg') {
      const { groupName, text } = msg;
      if (!groups[groupName]) return;

      if (!chats[groupName]) chats[groupName] = [];
      chats[groupName].push({ from: nick, text });
      saveChats();

      peers.forEach((peerNick, sock) => {
        if (groups[groupName].members.includes(peerNick) && sock.readyState === 1) {
          sock.send(JSON.stringify({ type: 'group-msg', groupName, from: nick, text }));
        }
      });
    }

    if (msg.type === 'group-file') {
      handleGroupFileMessage(msg, nick);
    }



    if (msg.type === 'join-group') {
      const { groupName } = msg;
      if (groups[groupName] && !groups[groupName].members.includes(nick)) {
        groups[groupName].members.push(nick);
        saveGroups();
        broadcastUsers();
      }
    }

    if (msg.type === 'get-group-history') {
      const { groupName } = msg;
      ws.send(JSON.stringify({ 
        type: 'group-history', 
        groupName, 
        history: chats[groupName] || [] 
      }));
    }

    if (msg.type === 'history') {
      const key = [nick, msg.peer].sort().join('|');
      ws.send(JSON.stringify({ type: 'history', peer: msg.peer, history: chats[key] || [] }));
    }
  });

  ws.on('close', () => {
    peers.delete(ws);
    broadcastUsers();
  });
});

// периодический «пинг» списка
const broadcastInterval = setInterval(broadcastUsers, 5000);

console.log(`▶ mini‑chat server started on ws://localhost:${PORT}`);

module.exports = { wss, handleGroupFileMessage, groups, chats, peers, broadcastInterval };
