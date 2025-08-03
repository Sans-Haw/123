const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  manualCheck: () => ipcRenderer.invoke('manual-update-check')
});


contextBridge.exposeInMainWorld("teleLauncher", {
  startTelegram: (exe, grp) => ipcRenderer.invoke("start-telegram", exe, grp),
  stop:         (pid)       => ipcRenderer.invoke("stop-pid",     pid),
  stopGroup:    (gid)       => ipcRenderer.invoke("stop-group",   gid),
  list:                      ()  => ipcRenderer.invoke("list-active")
});

contextBridge.exposeInMainWorld('electronAPI', {
  getList: () => ipcRenderer.invoke('get-list'),
  addTelegram: () => ipcRenderer.invoke('add-telegram'),
  addFromFolder: () => ipcRenderer.invoke('add-from-folder'),
  removeTelegram: (path) => ipcRenderer.invoke('remove-telegram', path),
  launchTelegram: (path) => ipcRenderer.invoke('launch-telegram', path),
  closeAll: () => ipcRenderer.invoke('close-all-telegram'),
  saveGroup: (groupName, paths) => ipcRenderer.invoke('save-group', groupName, paths), // ← вот это обязательно!
  getGroups: () => ipcRenderer.invoke('get-groups'),
  deleteGroup: (name) => ipcRenderer.invoke('delete-group', name),
  checkRunningTelegrams: () => ipcRenderer.invoke('check-running-telegrams'),
  killTelegramByPid: (pid) => ipcRenderer.invoke('kill-telegram-by-pid', pid),
  closeGroup: (name) => ipcRenderer.invoke('close-group', name),
  launchGroup: (groupName) => ipcRenderer.invoke('launch-group', groupName),
  getTelegramOrder: () => ipcRenderer.invoke('get-telegram-order'),
  saveTelegramOrder: (order) => ipcRenderer.invoke('save-telegram-order', order),
  getTelegramNames: () => ipcRenderer.invoke('get-telegram-names'),
  renameTelegram: (path, newName) => ipcRenderer.invoke('rename-telegram', path, newName),
  getGroupOrder: () => ipcRenderer.invoke('get-group-order'),
  clearTelegramCache: (path) => ipcRenderer.invoke('clear-telegram-cache', path),
  saveGroupOrder: (order) => ipcRenderer.invoke('save-group-order', order),
  removeFromGroup: (group, path) => ipcRenderer.invoke('remove-from-group', group, path),
  focusTelegramByPid: (pid) => ipcRenderer.invoke('focus-telegram-by-pid', pid),
});
