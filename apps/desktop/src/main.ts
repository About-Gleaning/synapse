import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { app, BrowserWindow, dialog, ipcMain } from "electron";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

const SERVER_PORT = process.env.SYNAPSE_SERVER_PORT || "38655";
const WEB_URL = process.env.SYNAPSE_WEB_URL || "http://127.0.0.1:5173";

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void mainWindow.loadURL(WEB_URL);
}

function startServer(): void {
  if (serverProcess) {
    return;
  }

  serverProcess = spawn(
    "pnpm",
    ["--filter", "@synapse/server", "dev"],
    {
      env: {
        ...process.env,
        SYNAPSE_SERVER_PORT: SERVER_PORT,
      },
      stdio: "inherit",
      cwd: path.join(app.getAppPath(), "..", ".."),
    },
  );
}

ipcMain.handle("desktop:choose-knowledge-root", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
});
