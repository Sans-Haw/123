(() => {
    let renameTargetPath = null;
    function openRename(path, currentName) {
      renameTargetPath = path;
      document.getElementById('renameInput').value = currentName;
      document.getElementById('renameModal').style.display = 'flex';
    }

    let chatGroups   = {}; 
    let currentGroup = null;
    let currentPeer  = null;


    async function clearAllCaches() {
      const list = await window.electronAPI.getList();
      const confirmed = confirm(`Удалить временные файлы кэша у ${list.length} Telegram?`);
      if (!confirmed) return;

      for (const item of list) {
        await window.electronAPI.clearTelegramCache(item.path);
      }

      alert('Кэш очищен у всех Telegram');
    }

    let groupSelectPaths = [];

    async function addToGroup() {
      const checkboxes = document.querySelectorAll('#telegramList input[type="checkbox"]');
      const selected = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

      if (selected.length === 0) {
        alert("Сначала выбери Telegram.exe");
        return;
      }

      const groups = await window.electronAPI.getGroups();
      const dropdown = document.getElementById('groupSelectDropdown');
      dropdown.innerHTML = '';

      for (const groupName in groups) {
        const option = document.createElement('option');
        option.value = groupName;
        option.innerText = groupName;
        dropdown.appendChild(option);
      }

      if (dropdown.options.length === 0) {
        alert("Нет доступных групп.");
        return;
      }

      groupSelectPaths = selected;
      document.getElementById('groupSelectModal').style.display = 'flex';
    }

    function closeGroupSelect() {
      document.getElementById('groupSelectModal').style.display = 'none';
      groupSelectPaths = [];
    }

    function deselectAll() {
      const checkboxes = document.querySelectorAll('#telegramList input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = false);
    }


    async function confirmAddToGroup() {
      const groupName = document.getElementById('groupSelectDropdown').value;
      if (!groupName) return;

      const groups = await window.electronAPI.getGroups();
      const existing = groups[groupName] || [];

      const updated = [...new Set([...existing, ...groupSelectPaths])];
      await window.electronAPI.saveGroup(groupName, updated);

      closeGroupSelect();
      alert(`Добавлено в группу "${groupName}"`);
      loadGroups();
    }



    async function deleteSelected() {
      const checkboxes = document.querySelectorAll('#telegramList input[type="checkbox"]');
      const selected = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

      if (selected.length === 0) {
        alert("Ничего не выбрано");
        return;
      }

      const confirmed = confirm(`Удалить ${selected.length} Telegram.exe из списка?`);
      if (!confirmed) return;

      for (const path of selected) {
        await window.electronAPI.removeTelegram(path);
      }

      loadList();
    }

    function refreshChatGroupList() {        // ← новое имя
      const select = document.getElementById('groupSelect');
      select.innerHTML = '';
      Object.keys(chatGroups).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
    }

    function createGroup() {
      const groupName = document.getElementById('newGroupName').value.trim();
      if (!groupName) {
        alert('Введите имя группы!');
        return;
      }

      const members = [myNick];
      ws.send(JSON.stringify({ type: 'create-group', groupName, members }));

      chatGroups[groupName] = { members: [myNick] }; // ← обязательно добавь это
      refreshChatGroupList();
      
      document.getElementById('newGroupName').value = ''; // очистка поля после создания
    }


    function joinSelectedGroup() {
      const groupName = document.getElementById('groupSelect').value;
      if (!groupName) return;

      currentGroup = groupName;
      currentPeer = null;
      sendBtn.disabled = false;

      document.getElementById('chatBox').innerHTML = '';
      ws.send(JSON.stringify({ type: 'join-group', groupName })); // Вступаем в группу
      ws.send(JSON.stringify({ type: 'get-group-history', groupName })); // Загружаем историю
    }



    // Отправка группового сообщения
    function sendMsg() {
      const txt = input.value.trim();
      if (!txt) return;

      if (currentGroup) {
        ws.send(JSON.stringify({ type: 'send-group-msg', groupName: currentGroup, text: txt }));
      } else if (currentPeer) {
        ws.send(JSON.stringify({ type: 'msg', to: currentPeer, text: txt }));
      } else {
        return;
      }

      appendChatLine(myNick, txt);
      input.value = '';
    }



    function closeRename() {
      document.getElementById('renameModal').style.display = 'none';
      renameTargetPath = null;
    }

    async function confirmRename() {
      const newName = document.getElementById('renameInput').value.trim();
      if (newName && renameTargetPath) {
        await window.electronAPI.renameTelegram(renameTargetPath, newName);
        closeRename();
        loadList();
      }
    }


    async function loadList() {
      const list = await window.electronAPI.getList();
      const order = await window.electronAPI.getTelegramOrder();
      const runningList = await window.electronAPI.checkRunningTelegrams();
      const nameMap = await window.electronAPI.getTelegramNames();
      

      const runningMap = new Map();
      runningList.forEach(proc => {
        runningMap.set(proc.path.toLowerCase(), proc.pid);
      });

      const container = document.getElementById('telegramList');
      container.innerHTML = '';

      const orderedList = [...order.filter(p => list.some(i => i.path === p)), ...list.filter(i => !order.includes(i.path)).map(i => i.path)];

      const listMap = new Map(list.map(item => [item.path, item]));

      orderedList.forEach((path, index) => {
        const item = listMap.get(path);
        if (!item) return;

        const li = document.createElement('li');
        li.className = 'telegram-card';
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-path', path);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item.path;
        checkbox.id = 'tg_' + index;

        const info = document.createElement('div');
        info.className = 'info';

        const name = document.createElement('div');
        name.className = 'name';
        name.innerText = nameMap[item.path] || item.name;
        name.style.display = 'inline-block';

        const editBtn = document.createElement('button');
        editBtn.className = 'rename-button';
        editBtn.title = 'Переименовать';

        const icon = document.createElement('img');
        icon.src = 'icons/1.png';
        editBtn.appendChild(icon);

        editBtn.onclick = () => {
          openRename(item.path, name.innerText);
        };



        const pathEl = document.createElement('div');
        pathEl.className = 'path';
        pathEl.innerText = item.path;

        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'center';
        nameRow.appendChild(name);
        nameRow.appendChild(editBtn);
        info.appendChild(nameRow);

        info.appendChild(pathEl);

        const buttonWrap = document.createElement('div');
        buttonWrap.style.display = 'flex';
        buttonWrap.style.gap = '8px';
        buttonWrap.style.marginTop = '6px';

        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️ Удалить';
        delBtn.onclick = async () => {
          await window.electronAPI.removeTelegram(item.path);
          loadList();
        };

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '🧹 Очистить кэш';
        clearBtn.onclick = async () => {
          const confirmed = confirm('Удалить временные файлы кэша этого Telegram?');
          if (confirmed) {
            await window.electronAPI.clearTelegramCache(item.path);
            alert('Кэш очищен');
          }
        };

        buttonWrap.appendChild(delBtn);
        buttonWrap.appendChild(clearBtn);


        li.appendChild(checkbox);
        li.appendChild(info);
        li.appendChild(buttonWrap);


        const pid = runningMap.get(item.path.toLowerCase());
        if (pid) {
          const runningLabel = document.createElement('span');
          runningLabel.innerText = '🟢 Запущен';
          runningLabel.style.marginLeft = '10px';
          runningLabel.style.color = 'green';
          info.appendChild(runningLabel);

          const killBtn = document.createElement('button');
          killBtn.textContent = '❌ Закрыть';
          killBtn.style.marginLeft = '8px';
          killBtn.onclick = async () => {
            await window.electronAPI.killTelegramByPid(pid);
            setTimeout(loadList, 500);
          };
          li.appendChild(killBtn);
        }

        container.appendChild(li);
      });

      // Drag & drop для изменения порядка
      let dragSrc = null;
      container.querySelectorAll('li').forEach(li => {
        li.addEventListener('dragstart', () => {
          dragSrc = li;
          li.classList.add('dragging');
        });

        li.addEventListener('dragend', () => {
          li.classList.remove('dragging');
          dragSrc = null;

          const newOrder = Array.from(container.querySelectorAll('li'))
            .map(li => li.dataset.path);
          window.electronAPI.saveTelegramOrder(newOrder);
        });

        li.addEventListener('dragover', e => {
          e.preventDefault();
          const target = li;
          if (target === dragSrc) return;
          const rect = target.getBoundingClientRect();
          const next = (e.clientY - rect.top) > rect.height / 2;
          container.insertBefore(dragSrc, next ? target.nextSibling : target);
        });
      });
    }


    async function addTelegram() {
      await window.electronAPI.addTelegram();
      loadList();
    }

    async function addFromFolder() {
      await window.electronAPI.addFromFolder();
      loadList();
    }

    async function launchSelected() {
      const checkboxes = document.querySelectorAll('#telegramList input[type=checkbox]');
      const selected = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

      for (const exePath of selected) {
        await window.electronAPI.launchTelegram(exePath);
      }
      setTimeout(loadList, 500);
    }

    async function closeAll() {
      await window.electronAPI.closeAll();
      setTimeout(loadList, 500);
    }

    function selectAll() {
      const checkboxes = document.querySelectorAll('#telegramList input[type=checkbox]');
      checkboxes.forEach(cb => cb.checked = true);
    }

    async function saveGroup() {
      const groupName = document.getElementById('groupNameInput').value.trim();
      if (!groupName) {
        alert("Введите имя группы");
        return;
      }

      const checkboxes = document.querySelectorAll('#telegramList input[type=checkbox]');
      const selected = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

      if (selected.length === 0) {
        alert("Сначала выбери хотя бы один Telegram.exe");
        return;
      }

      await window.electronAPI.saveGroup(groupName, selected);
      document.getElementById('groupNameInput').value = '';
      loadGroups();
    }

async function loadGroups() {
  const groupList = await window.electronAPI.getGroups();
  const savedOrder = await window.electronAPI.getGroupOrder();
  const container = document.getElementById('groupList');
  container.innerHTML = '';

  const groupNames = Object.keys(groupList);
  const ordered = [...savedOrder.filter(g => groupNames.includes(g)), ...groupNames.filter(g => !savedOrder.includes(g))];

  const grid = document.createElement('div');
  grid.className = 'group-grid';

  ordered.forEach(groupName => {
    const group = groupList[groupName];
    const card = document.createElement('div');
    card.className = 'group-card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-group', groupName);

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'center';
    topRow.style.marginBottom = '6px';

    const label = document.createElement('span');
    label.innerText = groupName;
    label.style.fontWeight = 'bold';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';

    const toggleBtn = document.createElement('button');
    toggleBtn.innerText = '▼';
    toggleBtn.style.marginLeft = '10px';
    toggleBtn.style.flexShrink = '0';

    const spacer = document.createElement('div');
    spacer.style.marginTop = '6px';

    const fileList = document.createElement('ul');
    fileList.style.marginTop = '10px';
    fileList.style.paddingLeft = '0';
    fileList.style.display = 'none';
    fileList.style.listStyleType = 'none';

    group.forEach(path => {
      const item = document.createElement('li');
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.marginBottom = '12px';

      const name = document.createElement('div');
      name.innerText = path;
      name.style.fontSize = '12px';
      name.style.color = '#555';
      name.style.marginBottom = '6px';
      name.style.wordBreak = 'break-all';

      const buttonRow = document.createElement('div');
      buttonRow.style.display = 'flex';
      buttonRow.style.flexWrap = 'wrap';
      buttonRow.style.gap = '6px';

      const runBtn = document.createElement('button');
      runBtn.innerText = '▶';
      runBtn.title = 'Запустить';
      runBtn.onclick = async () => {
        await window.electronAPI.launchTelegram(path);
        setTimeout(loadList, 500);
      };

      const killBtn = document.createElement('button');
      killBtn.innerText = '⛔';
      killBtn.title = 'Закрыть';
      killBtn.onclick = async () => {
        await window.electronAPI.killTelegramByPath(path);
        setTimeout(loadList, 500);
      };

      const removeBtn = document.createElement('button');
      removeBtn.innerText = '❌';
      removeBtn.title = 'Удалить из группы';
      removeBtn.onclick = async () => {
        await window.electronAPI.removeFromGroup(groupName, path);
        loadGroups();
      };

      buttonRow.append(runBtn, killBtn, removeBtn);
      item.append(name, buttonRow);
      fileList.appendChild(item);
    });


    toggleBtn.onclick = () => {
      const isHidden = fileList.style.display === 'none';
      fileList.style.display = isHidden ? 'block' : 'none';
      toggleBtn.innerText = isHidden ? '▲' : '▼';
      if (isHidden) {
        card.classList.add('expanded');
      } else {
        card.classList.remove('expanded');
      }
    };

    const btnWrap = document.createElement('div');
    btnWrap.style.marginTop = '10px';

    const runGroupBtn = document.createElement('button');
    runGroupBtn.innerText = '▶ Запустить';
    runGroupBtn.onclick = async () => {
      await window.electronAPI.launchGroup(groupName);
      setTimeout(loadList, 500);
    };

    const stopBtn = document.createElement('button');
    stopBtn.innerText = '⛔ Закрыть';
    stopBtn.onclick = async () => {
      await window.electronAPI.closeGroup(groupName);
      setTimeout(loadList, 500);
    };

    const delBtn = document.createElement('button');
    delBtn.innerText = '❌ Удалить';
    delBtn.onclick = async () => {
      await window.electronAPI.deleteGroup(groupName);
      loadGroups();
    };

    btnWrap.append(runGroupBtn, stopBtn, delBtn);

    const labelWrap = document.createElement('div');
    labelWrap.style.display = 'flex';
    labelWrap.style.alignItems = 'center';
    labelWrap.appendChild(label);

    topRow.appendChild(label)
    topRow.appendChild(labelWrap);
    topRow.appendChild(toggleBtn);
    card.appendChild(topRow);


    card.append(topRow, fileList, btnWrap);
    grid.appendChild(card);
  });

  container.appendChild(grid);

  // Drag & drop
  let dragSrc = null;
  grid.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('dragstart', () => {
      dragSrc = card;
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragSrc = null;
      const newOrder = Array.from(grid.querySelectorAll('.group-card')).map(c => c.dataset.group);
      window.electronAPI.saveGroupOrder(newOrder);
    });

    card.addEventListener('dragover', e => {
      e.preventDefault();
      const target = card;
      if (target === dragSrc) return;

      const rect = target.getBoundingClientRect();
      const offset = e.clientX - rect.left;

      // Вставлять слева или справа
      const insertAfter = offset > rect.width / 2;

      if (insertAfter) {
        grid.insertBefore(dragSrc, target.nextSibling);
      } else {
        grid.insertBefore(dragSrc, target);
      }
    });
  });
}


    loadList();
    loadGroups();

    /* ----- Запущенные Telegram ----- */
    async function loadRunningGrid() {
      // 1) какие Telegram.exe сейчас перечислены в списке
      const list = await window.electronAPI.getList();
      const nameMap = await window.electronAPI.getTelegramNames();
      const pathToName = new Map(list.map(i => [i.path.toLowerCase(), nameMap[i.path] || i.name]));

      // 2) какие реально запущены
      const running = await window.electronAPI.checkRunningTelegrams(); // [{path, pid}]

      const grid = document.getElementById('runningGrid');
      grid.innerHTML = '';

      running.forEach(proc => {
        const friendly = pathToName.get(proc.path.toLowerCase()) || 'Telegram';

        const card = document.createElement('div');
        card.className = 'running-card';
        card.dataset.pid = proc.pid;

        /* Иконка приложения */
        const img = document.createElement('img');
        img.src = 'icons/telegram.svg';
        img.alt = friendly;
        img.onclick = () => window.electronAPI.launchTelegram(proc.path);

        const label = document.createElement('div');
        label.textContent = friendly;

        /* Удалить (крестик) оставляем как раньше */
        const closeBtn = document.createElement('div');
        closeBtn.textContent = '✕';
        closeBtn.title = 'Закрыть Telegram';
        closeBtn.className = 'close-btn';
        closeBtn.onclick = async () => {
          await window.electronAPI.killTelegramByPid(proc.pid);
          setTimeout(loadRunningGrid, 300);
        };
        card.append(closeBtn, img, label);
        grid.appendChild(card);
      });


    }

    // первый запуск
    loadRunningGrid();
    // автообновление каждые 10 с
    setInterval(loadRunningGrid, 10000);


  const btn = document.getElementById('checkUpdate');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Проверяем...';
    try {
      const res = await window.updater.manualCheck();
      console.log(res);

      if (!res.ok) {
        alert('Ошибка: ' + res.msg);
        return;
      }

      if (res.updateAvailable) {
        alert('Доступно обновление до версии: ' + res.version);
      } else {
        alert('У вас уже последняя версия: ' + res.version);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Проверить обновление';
    }
  });

  

  
  const tgList = document.getElementById('telegramList');
  const listToggle = document.getElementById('toggleListBtn');

  listToggle.addEventListener('click', () => {
    const isHidden = tgList.classList.toggle('hidden');
    listToggle.textContent = isHidden ? '▼' : '▲';
    listToggle.title = isHidden ? 'Показать список Telegram' : 'Скрыть список Telegram';
  });

  const toolbar = document.getElementById('topBar');

  const sentinel = document.createElement('div');
  sentinel.style.height = '1px';
  toolbar.parentNode.insertBefore(sentinel, toolbar);

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      toolbar.classList.remove('compact');
    } else {
      toolbar.classList.add('compact');
    }
  }, { root: null, threshold: 0 });

  observer.observe(sentinel);

  // ── mini‑chat client ─────────────────────────────────────────
  let ws = null;
  let myNick = null;

  function receiveFile({ from, name, mime, data }) {
    const box = document.getElementById('chatBox');
    const fromLabel = (from === myNick ? 'Вы' : from);

    // Проверка: картинка или нет
    if (mime.startsWith('image/')) {
      const wrap = document.createElement('div');
      wrap.style.margin = '4px 0';

      const img = document.createElement('img');
      img.src = `data:${mime};base64,${data}`;
      img.style.maxWidth = '120px';
      img.style.maxHeight = '120px';
      img.style.display = 'block';
      img.style.borderRadius = '8px';
      img.style.marginBottom = '2px';
      img.style.cursor = 'pointer';

      // Клик для открытия в модалке
      img.onclick = function() {
        const modal = document.getElementById('imgModal');
        const modalImg = document.getElementById('imgModalImg');
        const modalDownload = document.getElementById('imgModalDownload');
        modalImg.src = img.src;
        modalDownload.href = img.src;
        modalDownload.download = name;
        modal.style.display = 'flex';
      };

      const label = document.createElement('div');
      label.textContent = `${fromLabel}: ${name}`;
      label.style.fontSize = '12px';
      label.style.opacity = '0.7';

      wrap.appendChild(img);
      wrap.appendChild(label);
      box.appendChild(wrap);
    }
    else {
      // обычный файл — просто ссылка
      const a = document.createElement('a');
      a.href = `data:${mime};base64,${data}`;
      a.download = name;
      a.textContent = `${fromLabel}: ${name}`;
      a.style.display = 'block';
      box.appendChild(a);
    }

    // автоскролл
    box.scrollTop = box.scrollHeight;
  }

  function handleWsMessage(e) {
    const data = JSON.parse(e.data);

    if (data.type === 'users') {
      renderUserList(data.list);
    }

    if (data.type === 'groups') {
      chatGroups = data.groups;
      refreshChatGroupList();
    }

    if (data.type === 'msg') receiveMsg(data);

    if (data.type === 'group-msg' && data.groupName === currentGroup) {
      if (data.from === myNick) return;
      appendChatLine(data.from, data.text);
    }

    if (data.type === 'history') renderHistory(data.history, data.peer);

    if (data.type === 'group-history') {
      const box = document.getElementById('chatBox');
      box.innerHTML = '';
      data.history.forEach(item => {
        if (item.file) {
          receiveFile({ from: item.from,
                        name: item.file.name,
                        mime: item.file.mime,
                        data: item.file.data });
        } else if (item.text !== undefined) {
          appendChatLine(item.from, item.text);
        }
      });
    }

    if (data.type === 'group-file' && data.groupName === currentGroup) {
      if (data.from === myNick) return; // игнорируем собственные файлы
      console.log('Получен файл от:', data.from, data.name);
      receiveFile(data);
    }

    if (data.type === 'file') receiveFile(data);
  }

  // вход по нику
  function joinChat() {
    const nickInput = document.getElementById('nickInput');
    const nickVal = nickInput.value.trim();
    if (!nickVal) { 
      alert('Введите ник');
      return; 
    }

    localStorage.setItem('launcherChatNick', nickVal); // сохраняем ник в браузере

    myNick = nickVal;
    ws = new WebSocket('ws://103.179.44.171:8082');

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', nick: myNick }));
    };

    ws.onmessage = handleWsMessage;


    document.getElementById('nickPrompt').style.display = 'none';
    document.getElementById('chatArea').style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', function() {
    const savedNick = localStorage.getItem('launcherChatNick');
    if (savedNick) {
      myNick = savedNick;
      document.getElementById('nickInput').value = savedNick;

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Recreate');      // аккуратно закрываем
      }

      ws = new WebSocket('ws://103.179.44.171:8082'); // исправленный порт

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', nick: myNick }));
      };

      ws.onmessage = handleWsMessage;

      document.getElementById('nickPrompt').style.display = 'none';
      document.getElementById('chatArea').style.display = 'block';
    }
  });



  const input = document.getElementById('msgInput');
  const sendBtn = document.getElementById('sendBtn');

  sendBtn.onclick = sendMsg;

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      sendMsg();
      e.preventDefault();
    }
  });


  // вывод списка пользователей
  function renderUserList(list) {
    const ul = document.getElementById('userList');
    ul.innerHTML = '';
    list.filter(n => n !== myNick).forEach(nick => {
      const li = document.createElement('li');
      li.textContent = nick;
      li.style.cursor = 'pointer';
      li.style.padding = '4px';
      li.onclick = () => selectPeer(nick);
      ul.appendChild(li);
    });
  }

  // выбор собеседника
  function selectPeer(nick) {
    currentPeer = nick;
    currentGroup = null;
    document.getElementById('chatBox').innerHTML = '';
    document.getElementById('sendBtn').disabled  = false;
    ws.send(JSON.stringify({ type: 'history', peer: nick }));
  }

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
        appendChatLine(item.from, item.text);
      }
    });
  }


  // приём сообщения
  function receiveMsg({ from, text }) {
    if (from === myNick) return;  // ← Добавь эту проверку
    appendChatLine(from, text);
  }


  function appendChatLine(from, text) {
    const box = document.getElementById('chatBox');
    const div = document.createElement('div');
    div.textContent = `${from}: ${text}`;
    div.className = from === myNick ? 'my-msg' : 'peer-msg';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }


  const fileInput = document.getElementById('fileInput');
  const attachBtn = document.getElementById('attachBtn');

  attachBtn.onclick = () => fileInput.click();

  fileInput.onchange = function() {
    if (!fileInput.files.length || !(currentPeer || currentGroup)) return;

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function() {
      const payload = {
        name: file.name,
        mime: file.type,
        data: reader.result.split(',')[1]
      };

      if (currentGroup) {
        ws.send(JSON.stringify({
          type: "group-file",
          groupName: currentGroup,
          ...payload
        }));
        receiveFile({ from: myNick, ...payload });
      } else if (currentPeer) {
        ws.send(JSON.stringify({
          type: "file",
          to: currentPeer,
          ...payload
        }));
        receiveFile({ from: myNick, ...payload }); // для личного чата оставь
      }
    };

    reader.readAsDataURL(file);
    fileInput.value = '';
  };




  const imgModal = document.getElementById('imgModal');
  const imgModalClose = document.getElementById('imgModalClose');

  // Закрытие по крестику
  imgModalClose.onclick = function(e) {
    imgModal.style.display = 'none';
    e.stopPropagation();
  };

  // Закрытие по клику вне картинки и вне кнопки (по фону)
  imgModal.onclick = function(e) {
    if (e.target === imgModal) {
      imgModal.style.display = 'none';
    }
  };

  // Закрытие по Esc
  window.addEventListener('keydown', function(e) {
    if (imgModal.style.display !== 'none' && (e.key === 'Escape' || e.key === 'Esc')) {
      imgModal.style.display = 'none';
    }
  });

  window.addTelegram = addTelegram;
  window.addFromFolder = addFromFolder;
  window.launchSelected = launchSelected;
  window.deleteSelected = deleteSelected;
  window.closeAll = closeAll;
  window.clearAllCaches = clearAllCaches;
  window.selectAll = selectAll;
  window.deselectAll = deselectAll;
  window.addToGroup = addToGroup;
  window.saveGroup = saveGroup;
  window.closeRename = closeRename;
  window.confirmRename = confirmRename;
  window.createGroup = createGroup;
  window.joinSelectedGroup = joinSelectedGroup;
  window.joinChat = joinChat;
  window.closeGroupSelect = closeGroupSelect;
  window.confirmAddToGroup = confirmAddToGroup;
})();
