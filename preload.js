const { contextBridge, ipcRenderer } = require("electron");

// The web app (app.qtr.ai) looks for window.qtrDesktop and, when it's there, signs in through the default browser.
contextBridge.exposeInMainWorld("qtrDesktop", {
  isDesktop: true,
  startGoogleSignIn: () => ipcRenderer.invoke("qtr:start-sign-in"),
  onSignInResult: cb => {
    const listener = (_event, result) => cb(result);
    ipcRenderer.on("qtr:sign-in-result", listener);
    return () => ipcRenderer.removeListener("qtr:sign-in-result", listener);
  },
});
