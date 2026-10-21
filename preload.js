const { contextBridge, ipcRenderer } = require("electron");

// The web app (app.qtr.ai) looks for window.qtrDesktop and, when it's there, signs in through the default browser.
contextBridge.exposeInMainWorld("qtrDesktop", {
  isDesktop: true,
  startGoogleSignIn: () => ipcRenderer.invoke("qtr:start-sign-in"),
  openExternal: url => ipcRenderer.invoke("qtr:open-external", url),
  onSignInResult: cb => {
    const listener = (_event, result) => cb(result);
    ipcRenderer.on("qtr:sign-in-result", listener);
    return () => ipcRenderer.removeListener("qtr:sign-in-result", listener);
  },
  onUpdateReady: cb => {
    const listener = (_event, update) => cb(update);
    ipcRenderer.on("qtr:update-ready", listener);
    ipcRenderer.send("qtr:update-listening");
    return () => ipcRenderer.removeListener("qtr:update-ready", listener);
  },
  restartToUpdate: () => ipcRenderer.invoke("qtr:restart-to-update"),
});
