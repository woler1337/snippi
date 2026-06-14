'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('paletteApi', {
  getSnippets:  () => ipcRenderer.invoke('get-snippets'),
  getGroups:    () => ipcRenderer.invoke('get-groups'),
  getClipboard: () => ipcRenderer.invoke('get-clipboard-history'),
  getOcr:       () => ipcRenderer.invoke('get-ocr-settings'),
  getTranslate: () => ipcRenderer.invoke('get-translate-settings'),
  paste:        (text, format)            => ipcRenderer.invoke('palette-paste', text, format),
  run:          (cmd)                     => ipcRenderer.invoke('palette-run', cmd),
  submitForm:   (rawText, format, values) => ipcRenderer.invoke('palette-submit-form', rawText, format, values),
  close:        () => ipcRenderer.invoke('palette-close'),
  onOpen:       (cb) => ipcRenderer.on('palette-open', () => { try { cb(); } catch {} }),
  onOpenForm:   (cb) => ipcRenderer.on('palette-open-form', (_e, data) => { try { cb(data); } catch {} }),
});
