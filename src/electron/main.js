import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const isDev = process.env.NODE_ENV === 'development';
const hostedProdUrl = process.env.ELECTRON_PROD_URL || 'https://cruwellsvox.web.app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

const createWindow = () => {
  const iconPath = isDev
    ? path.join(__dirname, '../../public/logo.png')
    : undefined;
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
      webSecurity: true
    },
    icon: iconPath
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : hostedProdUrl;

  mainWindow.loadURL(startUrl);
  mainWindow.show();
  
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-fail-load', () => {
    console.warn('Failed to load URL, retrying...', startUrl);
    setTimeout(() => mainWindow.loadURL(startUrl), 1000);
  });

  mainWindow.webContents.on('crashed', () => {
    console.error('Renderer process crashed');
    mainWindow.reload();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers for native audio APIs
ipcMain.handle('get-audio-devices', async () => {
  try {
    // Get audio devices through Electron's mediaDevices API
    return {
      input: [],
      output: []
    };
  } catch (error) {
    console.error('Error getting audio devices:', error);
    return { input: [], output: [] };
  }
});

ipcMain.handle('get-window-info', () => {
  return {
    isDev,
    platform: process.platform,
    nodeVersion: process.version,
    electronVersion: process.versions.electron
  };
});

// Request system microphone permission on macOS
if (process.platform === 'darwin') {
  app.post(() => {
    mainWindow?.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'microphone') {
        callback(true);
      } else {
        callback(false);
      }
    });
  });
}

const createMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            const aboutWindow = new BrowserWindow({ width: 400, height: 300 });
            aboutWindow.loadURL(`data:text/html,<h1>CruwellsVox Desktop</h1><p>A 10-person voice conference app built with Electron & WebRTC</p>`);
          }
        }
      ]
    }
  ];

  if (isDev) {
    template.push({
      label: 'Developer',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Hard Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: 'Toggle DevTools', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.whenReady().then(() => {
  createMenu();
});
