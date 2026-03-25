const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  getWindowInfo: () => ipcRenderer.invoke('get-window-info'),
  requestMicrophone: () => ipcRenderer.invoke('request-microphone'),
  isDev: process.env.NODE_ENV === 'development'
});
