const { spawn } = require('child_process');

let Store; // будет загружен позже динамически

const active = new Map();

async function initStore() {
  const StoreModule = await import('electron-store');
  Store = new StoreModule.default({ name: 'pids' });

  const saved = Store.get('processes') || {};
  for (const [pidStr, info] of Object.entries(saved)) {
    const pid = Number(pidStr);
    if (isRunning(pid)) {
      active.set(pid, info);
    }
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function persist() {
  const obj = Object.fromEntries(active);
  Store.set('processes', obj);
}

function startTelegram(exePath, groupId) {
  const child = spawn(exePath, [], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  const info = { pid: child.pid, exePath, groupId };
  active.set(child.pid, info);
  persist();

  child.on('exit', () => {
    active.delete(child.pid);
    persist();
  });

  return info;
}

function stop(pid) {
  try {
    process.kill(pid, process.platform === 'win32' ? undefined : 'SIGTERM');
  } catch (e) {
    console.warn(`Ошибка при завершении PID ${pid}:`, e.message);
  }
}

function stopGroup(groupId) {
  for (const [pid, info] of active.entries()) {
    if (info.groupId === groupId) stop(pid);
  }
}

function list() {
  return Array.from(active.values());
}

module.exports = {
  initStore,
  startTelegram,
  stop,
  stopGroup,
  list
};
