const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { handleGroupFileMessage, wss, groups, chats, peers, broadcastInterval } = require('./chat-server');

function createMockSocket() {
  const sock = new EventEmitter();
  sock.sent = [];
  sock.readyState = 1;
  sock.send = function (data) {
    this.sent.push(data);
  };
  return sock;
}

beforeEach(() => {
  Object.keys(groups).forEach(k => delete groups[k]);
  Object.keys(chats).forEach(k => delete chats[k]);
  peers.clear();
});

after(() => {
  clearInterval(broadcastInterval);
  wss.close();
});

test('handleGroupFileMessage suppresses duplicate files', () => {
  groups.test = { members: ['alice'] };
  const ws = createMockSocket();
  peers.set(ws, 'alice');
  const msg = { groupName: 'test', name: 'file.txt', mime: 'text/plain', data: 'data' };

  handleGroupFileMessage(msg, 'alice');
  handleGroupFileMessage(msg, 'alice');

  assert.strictEqual(chats.test.length, 1);
  assert.strictEqual(ws.sent.length, 2);
});

test('handleGroupFileMessage broadcasts to each member once', () => {
  groups.g = { members: ['alice', 'bob'] };
  const wsA1 = createMockSocket();
  const wsA2 = createMockSocket();
  const wsB = createMockSocket();
  peers.set(wsA1, 'alice');
  peers.set(wsA2, 'alice');
  peers.set(wsB, 'bob');
  const msg = { groupName: 'g', name: 'f.txt', mime: 'text/plain', data: '123' };

  handleGroupFileMessage(msg, 'alice');

  assert.strictEqual(wsA1.sent.length + wsA2.sent.length, 1);
  assert.strictEqual(wsB.sent.length, 1);
});

test('server handles group-file messages once', () => {
  groups.g = { members: ['alice', 'bob'] };
  const wsAlice = createMockSocket();
  const wsBob = createMockSocket();

  wss.emit('connection', wsAlice);
  wss.emit('connection', wsBob);

  wsAlice.emit('message', JSON.stringify({ type: 'join', nick: 'alice' }));
  wsBob.emit('message', JSON.stringify({ type: 'join', nick: 'bob' }));

  wsAlice.emit('message', JSON.stringify({
    type: 'group-file',
    groupName: 'g',
    name: 'file.txt',
    mime: 'text/plain',
    data: 'payload'
  }));

  const aliceFiles = wsAlice.sent.filter(m => JSON.parse(m).type === 'group-file');
  const bobFiles = wsBob.sent.filter(m => JSON.parse(m).type === 'group-file');

  assert.strictEqual(aliceFiles.length, 1);
  assert.strictEqual(bobFiles.length, 1);
});
