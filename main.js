const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { setupUpdates, pageReloading, checkForUpdatesNow, isInstallingUpdate, notifyFinishingUpdate } = require("./updater");
const { flavorOf, SERVERS, serverOrigin, readServer, writeServer, signInUrl } = require("./flavor");

const FLAVOR = flavorOf({ pkg: require("./package.json"), env: process.env, packaged: app.isPackaged });
const IS_DEV = FLAVOR === "dev";
const APP_NAME = IS_DEV ? "QTR Dev" : "QTR";
// Its own userData keeps QTR Dev's sign-in, window state and single-instance lock apart from QTR's, even from source.
if (IS_DEV) {
  app.setName(APP_NAME);
  app.setPath("userData", path.join(app.getPath("appData"), APP_NAME));
}

const serverFile = () => path.join(app.getPath("userData"), "server.json");
let serverId = IS_DEV ? readServer(serverFile()) : null;
const startUrl = () => process.env.QTR_URL || (IS_DEV ? serverOrigin(serverId) : "https://app.qtr.ai");
const currentOrigin = () => new URL(startUrl()).origin;
// qtr.ai itself is the marketing site; only the app opens in the window.
const APP_ORIGINS = new Set([
  currentOrigin(),
  ...(IS_DEV ? SERVERS.map(s => s.origin) : ["https://app.qtr.ai"]),
]);
// Firebase's popup hosts. Google refuses sign-in inside an embedded browser, so new web builds sign in through the
// default browser instead (see startSignIn); this only keeps an older web build's popup from opening a blank tab.
const AUTH_HOSTS = [/^accounts\.google\.com$/, /^apis\.google\.com$/, /\.firebaseapp\.com$/, /\.web\.app$/];
const PROTOCOL = IS_DEV ? "qtr-dev" : "qtr";
const SIGN_IN_TTL_MS = 10 * 60 * 1000;

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
let pendingSignIn = null; // { state, expires }
let queuedUrl = null;

const startSignIn = () => {
  const state = crypto.randomBytes(16).toString("hex");
  pendingSignIn = { state, expires: Date.now() + SIGN_IN_TTL_MS };
  shell.openExternal(signInUrl(currentOrigin(), state, FLAVOR));
};

// The browser page hands the Google credential back as qtr://auth?state=…&id_token=…&access_token=… (qtr-dev:// for QTR Dev).
// Only a state this app just issued is accepted, once, so another page can't sign the app into someone else's account.
const handleProtocolUrl = url => {
  if (!mainWindow) { queuedUrl = url; return; }
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  if (parsed.protocol !== `${PROTOCOL}:` || parsed.hostname !== "auth") return;
  const pending = pendingSignIn;
  pendingSignIn = null;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (!pending || pending.expires < Date.now() || parsed.searchParams.get("state") !== pending.state) {
    if (pending) mainWindow.webContents.send("qtr:sign-in-result", { error: "That sign-in has expired. Try again." });
    return;
  }
  const idToken = parsed.searchParams.get("id_token");
  if (!idToken) {
    mainWindow.webContents.send("qtr:sign-in-result", { error: "Sign-in didn't finish. Try again." });
    return;
  }
  mainWindow.webContents.send("qtr:sign-in-result", { idToken, accessToken: parsed.searchParams.get("access_token") || undefined });
};

const createWindow = () => {
  const saved = readState();
  mainWindow = new BrowserWindow({
    width: saved.width || 1440,
    height: saved.height || 900,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: "#2b2c22",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 16 },
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true, preload: path.join(__dirname, "preload.js") },
  });
  if (saved.maximized) mainWindow.maximize();

  mainWindow.on("enter-full-screen", () => mainWindow?.webContents.send("qtr:full-screen", true));
  mainWindow.on("leave-full-screen", () => mainWindow?.webContents.send("qtr:full-screen", false));

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

  // The desk asks before leaving with unsaved changes (beforeunload). Electron cancels silently unless we ask,
  // which made Reload and Quit do nothing.
  mainWindow.webContents.on("did-start-navigation", details => {
    if (details.isMainFrame && !details.isSameDocument) pageReloading();
  });

  mainWindow.webContents.on("will-prevent-unload", event => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "question",
      buttons: ["Leave", "Stay"],
      defaultId: 1,
      cancelId: 1,
      message: "Leave without saving?",
      detail: "This desk has changes you haven't saved.",
    });
    if (choice === 0) event.preventDefault();
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url) || isAuthUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.loadURL(startUrl());
  if (queuedUrl) { const url = queuedUrl; queuedUrl = null; mainWindow.webContents.once("did-finish-load", () => handleProtocolUrl(url)); }
};

const switchServer = id => {
  if (id === serverId) return;
  serverId = id;
  pendingSignIn = null;
  writeServer(serverFile(), id);
  if (mainWindow) mainWindow.loadURL(`${serverOrigin(id)}/`);
  else createWindow();
};

const serverMenu = () => ({
  label: "Server",
  submenu: [
    ...(process.env.QTR_URL ? [{ label: `QTR_URL: ${process.env.QTR_URL}`, enabled: false }, { type: "separator" }] : []),
    ...SERVERS.map(s => ({
      label: s.label,
      type: "radio",
      checked: s.id === serverId,
      enabled: !process.env.QTR_URL,
      click: () => switchServer(s.id),
    })),
  ],
});

const buildMenu = () => {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        ...(IS_DEV ? [] : [{ label: "Check for Updates…", click: () => checkForUpdatesNow() }]),
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
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
    ...(IS_DEV ? [serverMenu()] : []),
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}
app.on("open-url", (event, url) => { event.preventDefault(); handleProtocolUrl(url); });

ipcMain.handle("qtr:start-sign-in", event => {
  if (!isAppUrl(event.senderFrame?.url ?? "")) return;
  startSignIn();
});

ipcMain.handle("qtr:is-full-screen", event => {
  if (!isAppUrl(event.senderFrame?.url ?? "")) return false;
  return mainWindow?.isFullScreen() ?? false;
});

// Google's contacts consent page won't render inside the app window, so the web app asks for it in the default browser.
ipcMain.handle("qtr:open-external", async (event, url) => {
  if (!isAppUrl(event.senderFrame?.url ?? "")) return;
  if (typeof url !== "string") return;
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  if (parsed.protocol !== "https:" || parsed.hostname !== "accounts.google.com") return;
  await shell.openExternal(parsed.href);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find(a => a.startsWith(`${PROTOCOL}://`));
    if (url) handleProtocolUrl(url);
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    // Reopened while ShipIt is still installing: step aside, or it aborts the update. ShipIt reopens the app when done.
    if (!IS_DEV && app.isPackaged && await isInstallingUpdate()) {
      notifyFinishingUpdate();
      setTimeout(() => app.exit(0), 300);
      return;
    }
    nativeTheme.themeSource = "dark";
    // A packaged app gets its icon from icon.icns; running from source would otherwise show Electron's.
    if (!app.isPackaged) app.dock?.setIcon(path.join(__dirname, "build", IS_DEV ? "icon-dev.png" : "icon.png"));
    buildMenu();
    createWindow();
    // QTR Dev is rebuilt by hand and never auto-updates.
    if (!IS_DEV) setupUpdates(() => mainWindow);
    app.on("activate", () => {
      if (!mainWindow) createWindow();
      else mainWindow.show();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
