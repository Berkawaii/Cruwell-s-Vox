import { contextBridge, ipcRenderer } from 'electron';

// Expose safe IPC methods to React app
contextBridge.exposeInMainWorld('electronAPI', {
  // Get audio devices (input/output)
  getAudioDevices: async () => {
    return ipcRenderer.invoke('get-audio-devices');
  },

  // Get system information
  getWindowInfo: async () => {
    return ipcRenderer.invoke('get-window-info');
  },

  // Request microphone permission
  requestMicrophone: async () => {
    return ipcRenderer.invoke('request-microphone');
  },

  // Check if running in development
  isDev: process.env.NODE_ENV === 'development'
});

// Request microphone permission on app start
if (process.platform === 'darwin' && !process.env.SKIP_MICROPHONE_REQUEST) {
  // macOS: Request permission through system
  console.log('[Preload] Requesting microphone permission for macOS');
}
