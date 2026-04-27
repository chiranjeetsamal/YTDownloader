const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings) => ipcRenderer.invoke('settings:update', settings)
  },
  dialog: {
    chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder')
  },
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:readText')
  },
  metadata: {
    fetch: (url, settings) => ipcRenderer.invoke('metadata:fetch', { url, settings }),
    validateUrl: (url) => ipcRenderer.invoke('url:validate', url)
  },
  queue: {
    add: (item) => ipcRenderer.invoke('queue:add', item),
    list: () => ipcRenderer.invoke('queue:list'),
    start: (id) => ipcRenderer.invoke('queue:start', id),
    startQueued: () => ipcRenderer.invoke('queue:startQueued'),
    pause: (id) => ipcRenderer.invoke('queue:pause', id),
    resume: (id) => ipcRenderer.invoke('queue:resume', id),
    cancel: (id) => ipcRenderer.invoke('queue:cancel', id),
    retry: (id) => ipcRenderer.invoke('queue:retry', id),
    remove: (id) => ipcRenderer.invoke('queue:remove', id),
    clearCompleted: () => ipcRenderer.invoke('queue:clearCompleted'),
    openFile: (id) => ipcRenderer.invoke('queue:openFile', id),
    openFolder: (id) => ipcRenderer.invoke('queue:openFolder', id),
    onUpdated: (callback) => {
      const listener = (_event, items) => callback(items);
      ipcRenderer.on('queue:updated', listener);
      return () => ipcRenderer.removeListener('queue:updated', listener);
    }
  },
  tools: {
    checkYtDlp: () => ipcRenderer.invoke('tools:checkYtDlp'),
    checkFfmpeg: () => ipcRenderer.invoke('tools:checkFfmpeg'),
    updateYtDlp: () => ipcRenderer.invoke('tools:updateYtDlp')
  },
  shell: {
    openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath)
  }
});
