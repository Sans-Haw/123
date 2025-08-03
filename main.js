const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsExtra = require('fs-extra');
const { exec, execFile } = require('child_process');
const dataDir = path.join(app.getPath('userData'), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const nircmdPath = path.join(__dirname, 'nircmd.exe');

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

autoUpdater.autoDownload = false;               // автоматически скачивает обновления
autoUpdater.autoInstallOnAppQuit = false;       // установит при закрытии приложения
autoUpdater.requestHeaders = {                 // отключает кэш браузера на сервере
  'Cache-Control': 'no-cache'
};

let win;

const {
  initStore,
  startTelegram,
  stop,
  stopGroup,
  list
} = require('./processManager');

function renderHistory(history, peer) {
  const box = document.getElementById('chatBox');
  box.innerHTML = '';
  history.forEach(item => {
    if (item.file) {
      receiveFile({
        from: item.from,
        name: item.file.name,
        mime: item.file.mime,
        data: item.file.data
      });
    } else if (item.text !== undefined) {
      appendChatLine((item.from === myNick ? "Вы" : item.from) + ": " + item.text);
    }
    // если вдруг какой-то странный тип - ничего не выводим
  });
}

function createWindow () {
  win = new BrowserWindow({
    width: 600,
    height: 700,
    icon: path.join(__dirname, 'icon.png'), // ← путь к иконке
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
}



app.whenReady().then(async () => {
  await initStore();   // восстанавливаем PID‑ы

  if (app.isPackaged) {
    autoUpdater.requestHeaders = {
  "Cache-Control": "no-cache"
  };
    autoUpdater.checkForUpdatesAndNotify();   // ← вставить сюда
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});



const DATA_FILE             = path.join(dataDir, 'telegram-list.json');
const GROUP_FILE            = path.join(dataDir, 'groups.json');

function loadList() {
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('Ошибка чтения telegram-list.json:', e);
    return [];
  }
}


ipcMain.handle('clear-telegram-cache', async (event, exePath) => {
  try {
    const baseDir = path.dirname(exePath);
    const tdataDir = path.join(baseDir, 'tdata');
    const foldersToClear = ['user_data', 'cache', 'emoji', 'user_data#'];

    for (const folder of foldersToClear) {
      const target = path.join(tdataDir, folder);
      if (fs.existsSync(target)) {
        await fsExtra.remove(target);
      }
    }
    return true;
  } catch (err) {
    console.error('Ошибка очистки кэша:', err);
    return false;
  }
});


const TELEGRAM_ORDER_FILE   = path.join(dataDir, 'telegram-order.json');

function loadTelegramOrder() {
  if (!fs.existsSync(TELEGRAM_ORDER_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TELEGRAM_ORDER_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveTelegramOrder(order) {
  fs.writeFileSync(TELEGRAM_ORDER_FILE, JSON.stringify(order, null, 2), 'utf8');
}

const TELEGRAM_NAMES_FILE   = path.join(dataDir, 'telegram-names.json');

function loadTelegramNames() {
  if (!fs.existsSync(TELEGRAM_NAMES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TELEGRAM_NAMES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveTelegramNames(map) {
  fs.writeFileSync(TELEGRAM_NAMES_FILE, JSON.stringify(map, null, 2), 'utf8');
}


const GROUP_POS_FILE        = path.join(dataDir, 'group-positions.json');

function loadGroupPositions() {
  try {
    if (!fs.existsSync(GROUP_POS_FILE)) {
      fs.writeFileSync(GROUP_POS_FILE, '[]', 'utf8');
    }
    return JSON.parse(fs.readFileSync(GROUP_POS_FILE, 'utf8'));
  } catch (e) {
    console.error('Ошибка чтения group-positions.json:', e);
    return [];
  }
}

function saveGroupPositions(order) {
  try {
    fs.writeFileSync(GROUP_POS_FILE, JSON.stringify(order, null, 2), 'utf8');
  } catch (e) {
    console.error('Ошибка записи group-positions.json:', e);
  }
}


function saveList(list) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Ошибка записи telegram-list.json:', e);
  }
}

function loadGroups() {
  try {
    if (!fs.existsSync(GROUP_FILE)) fs.writeFileSync(GROUP_FILE, '{}');
    return JSON.parse(fs.readFileSync(GROUP_FILE, 'utf8'));
  } catch (e) {
    console.error('Ошибка чтения groups.json:', e);
    return {};
  }
}

function saveGroups(groups) {
  try {
    fs.writeFileSync(GROUP_FILE, JSON.stringify(groups, null, 2), 'utf8');
  } catch (e) {
    console.error('Ошибка записи groups.json:', e);
  }
}


ipcMain.handle('get-list', () => loadList());

ipcMain.handle('add-telegram', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Telegram Executable', extensions: ['exe'] }]
  });
  if (canceled || !filePaths[0]) return null;

  const exePath = filePaths[0];
  const folderName = path.basename(path.dirname(exePath));
  const list = loadList();
  if (!list.some(item => item.path === exePath)) {
    list.push({ name: folderName, path: exePath });
    saveList(list);
  }
  return list;
});

ipcMain.handle('add-from-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || !filePaths[0]) return;

  const found = [];
  function walk(currentPath) {
    const files = fs.readdirSync(currentPath);
    for (const file of files) {
      const fullPath = path.join(currentPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (
            file.toLowerCase() === 'telegram.exe' &&
            !fullPath.toLowerCase().includes('\\temp\\')
          ) {
            const folderName = path.basename(path.dirname(fullPath));
            found.push({ name: folderName, path: fullPath });
          }
    }
  }
  walk(filePaths[0]);

  const list = loadList();
  const existingPaths = new Set(list.map(i => i.path));
  for (const item of found) {
    if (!existingPaths.has(item.path)) list.push(item);
  }
  saveList(list);
});

ipcMain.handle('remove-telegram', (event, exePath) => {
  const list = loadList().filter(item => item.path !== exePath);
  saveList(list);
});


ipcMain.handle('launch-telegram', async (event, exePath) => {
  if (!fs.existsSync(exePath)) return;

  execFile(exePath, err => {
    if (err) console.error('Ошибка запуска:', exePath, err.message);
  });
});

ipcMain.handle('close-all-telegram', () => {
  exec('taskkill /IM Telegram.exe /F', err => err && console.error(err));
});

ipcMain.handle('save-group', (event, name, paths) => {
  const groups = loadGroups();
  groups[name] = paths;
  saveGroups(groups);
});

ipcMain.handle('get-groups', () => loadGroups());

ipcMain.handle('launch-group', async (event, name) => {
  const groups = loadGroups();
  const items = groups[name] || [];

  const running = await getRunningTelegrams();
  const runningPaths = new Set(
    running
      .map(p => p.path && p.path.toLowerCase().replaceAll('\\', '/'))
  );

  for (const p of items) {
    const normPath = p.toLowerCase().replaceAll('\\', '/');

    if (
      fs.existsSync(p) &&
      !runningPaths.has(normPath)
    ) {
      console.log('Запуск Telegram:', p);
      execFile(p, err => err && console.error(err));
    } else {
      console.log('Уже запущен, пропускаем:', p);
    }
  }
});



ipcMain.handle('delete-group', (event, name) => {
  const groups = loadGroups();
  delete groups[name];
  saveGroups(groups);
});

const getRunningTelegrams = () => {
  return new Promise((resolve) => {
    const command = `powershell -Command "Get-Process | Where-Object { $_.Path -like '*Telegram.exe' } | Select-Object Id,Path | ConvertTo-Json"`;

    exec(command, { encoding: 'utf8' }, (err, stdout) => {
      if (err || !stdout) {
        console.error('Ошибка получения процессов через PowerShell:', err);
        return resolve([]);
      }

      try {
        const list = JSON.parse(stdout);
        const processes = Array.isArray(list) ? list : [list];

        resolve(processes.map(p => ({
          pid: p.Id,
          path: p.Path
        })).filter(p => p.path));
      } catch (e) {
        console.error('Ошибка парсинга JSON процессов:', e);
        resolve([]);
      }
    });
  });
};


ipcMain.handle('get-telegram-order', () => loadTelegramOrder());
ipcMain.handle('save-telegram-order', (event, order) => saveTelegramOrder(order));

ipcMain.handle('get-telegram-names', () => loadTelegramNames());

ipcMain.handle('rename-telegram', (event, path, newName) => {
  const names = loadTelegramNames();
  names[path] = newName;
  saveTelegramNames(names);
});

ipcMain.handle("start-telegram", (_, exe, grp) => startTelegram(exe, grp));
ipcMain.handle("stop-pid",       (_, pid)     => stop(pid));
ipcMain.handle("stop-group",     (_, gid)     => stopGroup(gid));
ipcMain.handle("list-active",    ()           => list());

ipcMain.handle('get-group-order', () => loadGroupPositions());
ipcMain.handle('save-group-order', (event, order) => saveGroupPositions(order));
ipcMain.handle('remove-from-group', (event, group, pathToRemove) => {
  const groups = loadGroups();
  if (groups[group]) {
    groups[group] = groups[group].filter(p => p.toLowerCase() !== pathToRemove.toLowerCase());
    saveGroups(groups);
  }
});

ipcMain.handle('focus-telegram-by-pid', async (_e, pid) => {
  const cmd = `"${nircmdPath}" win activate process ${pid}`;
  exec(cmd, err => {
    if (err) console.error('Ошибка фокуса окна через nircmd:', err);
  });
});

ipcMain.handle('check-running-telegrams', async () => {
  const list = await getRunningTelegrams();
  return list; // [{ path: ..., pid: ... }, ...]
});

ipcMain.handle('kill-telegram-by-pid', async (event, pid) => {
  exec(`taskkill /PID ${pid} /F`, err => {
    if (err) console.error('Ошибка завершения PID', pid, err);
  });
});

ipcMain.handle('close-group', async (event, groupName) => {
  const groupList = loadGroups();
  const telegrams = groupList[groupName] || [];

  const runningList = await getRunningTelegrams(); // как в check-running-telegrams

  const toKill = runningList.filter(proc =>
    telegrams.map(p => p.toLowerCase()).includes(proc.path.toLowerCase())
  );

  for (const proc of toKill) {
    exec(`taskkill /PID ${proc.pid} /F`);
  }
});


// ── Ручная проверка обновлений ──────────────────────────
ipcMain.handle('manual-update-check', async () => {
  if (!app.isPackaged) {
    return { ok: false, msg: 'App is not packaged.' };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    const { updateInfo } = result;

    const localVersion = app.getVersion();
    const remoteVersion = updateInfo.version;

    if (remoteVersion !== localVersion) {
      await autoUpdater.downloadUpdate(); // скачиваем вручную
      return {
        ok: true,
        updateAvailable: true,
        version: remoteVersion
      };
    } else {
      return {
        ok: true,
        updateAvailable: false,
        version: remoteVersion
      };
    }
  } catch (err) {
    return { ok: false, msg: err.message };
  }
});

autoUpdater.on('update-downloaded', () => {
  const { dialog } = require('electron');
  dialog.showMessageBox({
    type: 'info',
    title: 'Доступно обновление',
    message: 'Обновление загружено. Перезапустить приложение для установки?',
    buttons: ['Перезапустить', 'Позже']
  }).then(result => {
    if (result.response === 0) { // пользователь выбрал "Перезапустить"
      autoUpdater.quitAndInstall();
    }
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
