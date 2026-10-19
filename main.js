const { app, BrowserWindow, Menu, nativeTheme, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const START_URL = process.env.QTR_URL || "https://app.qtr.ai";
// qtr.ai itself is the marketing site; only the app opens in the window.
const APP_ORIGINS = new Set([new URL(START_URL).origin, "https://app.qtr.ai"]);
// Firebase's Google sign-in opens a popup through these hosts and posts the result back to the opener.
const AUTH_HOSTS = [/^accounts\.google\.com$/, /^accounts\.youtube\.com$/, /^apis\.google\.com$/, /\.firebaseapp\.com$/, /\.web\.app$/];

// Google refuses sign-in from browsers that announce themselves as embedded, so drop the Electron and app tokens.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, "")
  .replace(new RegExp(`\\s${app.getName()}\\/\\S+`), "");

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
const readState = () => {
  try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return {}; }
};
const writeState = win => {
  if (win.isDestroyed()) return;
  const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
  try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch { /* best effort */ }
};

const isAppUrl = url => {
  try { return APP_ORIGINS.has(new URL(url).origin); } catch { return false; }
};
const isAuthUrl = url => {
  try { const host = new URL(url).hostname; return AUTH_HOSTS.some(re => re.test(host)); } catch { return false; }
};

let mainWindow = null;

const createWindow = () => {
  const saved = readState();
  mainWindow = new BrowserWindow({
    width: saved.width || 1440,
    height: saved.height || 900,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    title: "QTR",
    backgroundColor: "#2b2c22",
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  if (saved.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", () => writeState(mainWindow));
  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 500, height: 680, parent: mainWindow, title: "Sign in" } };
    }
    if (isAppUrl(url)) {
      mainWindow.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url) || isAuthUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.loadURL(START_URL);
};

const buildMenu = () => {
  const template = [
    { role: "appMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ type: "separator" }, { role: "toggleDevTools" }]),
      ],
    },
    {
      label: "Go",
      submenu: [
        { label: "Back", accelerator: "Cmd+[", click: () => mainWindow?.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: "Cmd+]", click: () => mainWindow?.webContents.navigationHistory.goForward() },
        { type: "separator" },
        { label: "Open in Browser", click: () => mainWindow && shell.openExternal(mainWindow.webContents.getURL()) },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = "dark";
    buildMenu();
    createWindow();
    app.on("activate", () => {
      if (!mainWindow) createWindow();
      else mainWindow.show();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
