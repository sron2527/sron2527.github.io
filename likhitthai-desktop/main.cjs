const { app, BrowserWindow, shell } = require("electron");

const APP_URL = "https://sron2527.github.io/likhitthai/";
const APP_HOST = "sron2527.github.io";

function isAppUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" &&
      url.hostname === APP_HOST &&
      url.pathname.startsWith("/likhitthai");
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    title: "LikhitThai Studio",
    autoHideMenuBar: true,
    backgroundColor: "#101218",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (url.startsWith("https://") || url.startsWith("http://")) {
        void shell.openExternal(url);
      }
    }
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.sron2527.likhitthaistudio");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
