const { app, BrowserWindow, shell, session } = require("electron");

const APP_URL = "https://sron2527.github.io/likhitthai/";
const APP_HOST = "sron2527.github.io";

// Block the ad providers currently embedded in the hosted web app.
// This is limited to advertising hosts; Gemini API and normal site assets remain allowed.
const BLOCKED_AD_HOSTS = [
  "googlesyndication.com",
  "googleadservices.com",
  "doubleclick.net",
  "googletagservices.com",
  "quarrelsomebitter.com"
];

function isAdRequest(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    if (BLOCKED_AD_HOSTS.some(domain => host === domain || host.endsWith("." + domain))) {
      return true;
    }

    // Catch Google-served ad paths without blocking ordinary Google APIs or fonts.
    if ((host === "google.com" || host.endsWith(".google.com")) &&
        /\/(pagead|ads|adview|pcs\/activeview)(\/|$)/i.test(url.pathname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

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

function hideAdsInPage(win) {
  // Network blocking prevents ad scripts and ad frames from loading.
  // This DOM cleanup also removes the reserved ad slots/labels from the page layout.
  void win.webContents.executeJavaScript(`
    (() => {
      const styleId = "likhitthai-desktop-hide-ads";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = [
          ".adsense-zone",
          ".hilltop-static-zone",
          '[aria-label="Advertisement"]',
          "ins.adsbygoogle",
          'iframe[src*="googlesyndication.com"]',
          'iframe[src*="doubleclick.net"]',
          'iframe[src*="quarrelsomebitter.com"]'
        ].join(",") + " { display:none!important; visibility:hidden!important; width:0!important; height:0!important; min-height:0!important; max-height:0!important; margin:0!important; padding:0!important; border:0!important; overflow:hidden!important; }";
        (document.head || document.documentElement).appendChild(style);
      }

      const removeAds = () => {
        document.querySelectorAll([
          ".adsense-zone",
          ".hilltop-static-zone",
          '[aria-label="Advertisement"]',
          "ins.adsbygoogle",
          'iframe[src*="googlesyndication.com"]',
          'iframe[src*="doubleclick.net"]',
          'iframe[src*="quarrelsomebitter.com"]'
        ].join(",")).forEach(element => element.remove());
      };

      removeAds();
      if (!window.__likhitThaiDesktopAdObserver && document.documentElement) {
        const observer = new MutationObserver(removeAds);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.__likhitThaiDesktopAdObserver = observer;
      }
    })();
  `).catch(() => {});
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

  win.webContents.on("did-finish-load", () => hideAdsInPage(win));
  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  // Apply ad blocking before the app page is loaded.
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["<all_urls>"] },
    (details, callback) => callback({ cancel: isAdRequest(details.url) })
  );

  app.setAppUserModelId("com.sron2527.likhitthaistudio");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
