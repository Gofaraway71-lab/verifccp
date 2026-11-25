import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'VérifCCP — Contrôle de Conformité CCP Algérie Poste',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const distIndexPath = path.join(__dirname, 'dist', 'index.html');

  if (!fs.existsSync(distIndexPath)) {
    dialog.showErrorBox(
      'Build manquant (dist/index.html)',
      'Le dossier "dist" est introuvable. Exécutez "npm run build" avant de lancer ou empaqueter l’application Electron.'
    );
    return;
  }

  win.loadFile(distIndexPath);

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    dialog.showErrorBox(
      'Erreur de chargement VérifCCP',
      `Impossible d'afficher l'interface (${errorCode}: ${errorDescription}).`
    );
  });
}

app.whenReady().then(() => {
  createWindow();

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
