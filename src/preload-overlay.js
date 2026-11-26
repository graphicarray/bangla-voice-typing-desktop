'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  onUi: (cb) => ipcRenderer.on('ui', (_e, m) => cb(m)),
  onLive: (cb) => ipcRenderer.on('live', (_e, t) => cb(t)),
  toggle: () => ipcRenderer.send('overlay:toggle'),
  hover: (over) => ipcRenderer.send('overlay:hover', over),
});
