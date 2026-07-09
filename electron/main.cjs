const { app, BrowserWindow, Menu, session, shell } = require("electron");

let mainWindow;
let expressServer;

const chromeUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
app.commandLine.appendSwitch("host-rules", "MAP local.y.qq.com 127.0.0.1");

const windowWebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  partition: "persist:qqmusic-karaoke"
};

async function startLocalServer() {
  const { startServer } = await import("../server.js");
  return startServer();
}

function isLocalAppUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|local\.y\.qq\.com)(:\d+)?(\/|$)/i.test(url);
}

function isQqMusicUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === "qq.com" || hostname.endsWith(".qq.com");
  } catch {
    return false;
  }
}

async function createWindow() {
  const serverInfo = await startLocalServer();
  expressServer = serverInfo.server;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#07111f",
    title: "QQ Music Karaoke",
    autoHideMenuBar: true,
    webPreferences: windowWebPreferences
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalAppUrl(url) || isQqMusicUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: "#07111f",
          webPreferences: windowWebPreferences
        }
      };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isLocalAppUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.webContents.setUserAgent(chromeUserAgent);
  await mainWindow.loadURL(serverInfo.url);
}

app.on("certificate-error", (event, _webContents, url, _error, certificate, callback) => {
  const isLocalQqCert = url.startsWith("https://local.y.qq.com:");

  if (isLocalQqCert && certificate.subjectName === "local.y.qq.com") {
    event.preventDefault();
    callback(true);
    return;
  }

  callback(false);
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const appSession = session.fromPartition("persist:qqmusic-karaoke");
  appSession.setUserAgent(chromeUserAgent);
  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    callback(permission === "geolocation" && isLocalAppUrl(url));
  });
  appSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (isQqMusicUrl(details.url) || isLocalAppUrl(details.url)) {
      headers["User-Agent"] = chromeUserAgent;
    }
    callback({ requestHeaders: headers });
  });

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (expressServer) {
    expressServer.close();
    expressServer = null;
  }
});
