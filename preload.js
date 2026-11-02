const { contextBridge, ipcRenderer } = require("electron");

// The web app (app.qtr.ai) looks for window.qtrDesktop and, when it's there, signs in through the default browser.
contextBridge.exposeInMainWorld("qtrDesktop", {
  isDesktop: true,
  titleBar: "inset",
  isFullScreen: () => ipcRenderer.invoke("qtr:is-full-screen"),
  onFullScreenChange: cb => {
    const listener = (_event, full) => cb(full);
    ipcRenderer.on("qtr:full-screen", listener);
    return () => ipcRenderer.removeListener("qtr:full-screen", listener);
  },
  startGoogleSignIn: () => ipcRenderer.invoke("qtr:start-sign-in"),
  openExternal: url => ipcRenderer.invoke("qtr:open-external", url),
  onSignInResult: cb => {
    const listener = (_event, result) => cb(result);
    ipcRenderer.on("qtr:sign-in-result", listener);
    return () => ipcRenderer.removeListener("qtr:sign-in-result", listener);
  },
  updateAlertsNative: true,
  webUpdateReady: info => ipcRenderer.send("qtr:web-update-ready", info),
  reportPromptQuiet: quiet => ipcRenderer.send("qtr:prompt-quiet", quiet),
  onReloadRequested: cb => {
    const listener = () => cb();
    ipcRenderer.on("qtr:reload-requested", listener);
    return () => ipcRenderer.removeListener("qtr:reload-requested", listener);
  },
  onCheckWebUpdate: cb => {
    const listener = () => cb();
    ipcRenderer.on("qtr:check-web", listener);
    return () => ipcRenderer.removeListener("qtr:check-web", listener);
  },
  webCheckResult: result => ipcRenderer.send("qtr:web-check-result", result),
});
