'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('paletteApi', {
  getSnippets: () => ipcRenderer.invoke('get-snippets'),
  getGroups:   () => ipcRenderer.invoke('get-groups'),
  paste:       (text, format) => ipcRenderer.invoke('palette-paste', text, format),
  close:       () => ipcRenderer.invoke('palette-close'),
  onOpen:      (cb) => ipcRenderer.on('palette-open', () => { try { cb(); } catch {} }),
});
