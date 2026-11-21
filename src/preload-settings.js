'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (patch) => ipcRenderer.invoke('cfg:set', patch),
  listModels: (apiKey) => ipcRenderer.invoke('models:list', apiKey),
  captureHotkey: () => ipcRenderer.invoke('hotkey:capture'),
  testMic: () => ipcRenderer.invoke('mic:test'),
  onLast: (cb) => ipcRenderer.on('last', (_e, text) => cb(text)),
});
