const { app, BrowserWindow, Menu, ipcMain, session } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';
const hostedProdUrl = process.env.ELECTRON_PROD_URL || 'https://cruwellsvox.web.app';
let mainWindow = null;

function getRendererUrl() {
  if (isDev) {
    return 'http://localhost:5173';
  }

  // Firebase Google Auth requires http/https origin; file:// fails with auth/unauthorized-domain.
  return hostedProdUrl;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  const startUrl = getRendererUrl();
  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    }
  ];

  if (isDev) {
    template.push({
      label: 'Developer',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Toggle DevTools', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'microphone' || permission === 'media') {
      callback(true);
      return;
    }
    callback(false);
  });
}

ipcMain.handle('get-window-info', () => ({
  isDev,
  platform: process.platform,
  nodeVersion: process.version,
  electronVersion: process.versions.electron
}));

ipcMain.handle('request-microphone', async () => true);
ipcMain.handle('get-audio-devices', async () => ({ input: [], output: [] }));

app.whenReady().then(() => {
  setupPermissions();
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
