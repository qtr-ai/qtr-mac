const RELEASE_NOTES_URL = "https://qtr.ai/releasenotes";
const LATER_MS = 4 * 60 * 60 * 1000;

function initialState() {
  return { web: null, shell: null, quiet: true, focused: false, showing: false, laterKey: null, laterUntil: 0 };
}

function promptKey(s) {
  if (s.shell) return `shell:${s.shell}`;
  if (s.web) return `web:${s.web}`;
  return null;
}

function promptFor(s) {
  if (s.shell) return { kind: "shell", version: s.shell };
  if (s.web) return { kind: "web", build: s.web };
  return null;
}

function keyOf(prompt) {
  return prompt.kind === "shell" ? `shell:${prompt.version}` : `web:${prompt.build}`;
}

function nextPrompt(s, now) {
  if (s.showing || !s.focused || !s.quiet) return null;
  const prompt = promptFor(s);
  if (!prompt) return null;
  if (s.laterKey === promptKey(s) && now < s.laterUntil) return null;
  return prompt;
}

function alertFor(prompt) {
  if (prompt.kind === "shell") {
    return {
      message: "A new version of QTR is ready",
      detail: `Version ${prompt.version} installs when you restart.`,
      buttons: ["Restart to update", "Later", "What's New"],
      defaultId: 0,
      cancelId: 1,
    };
  }
  return {
    message: "QTR has been updated",
    detail: "Reload to get the latest. It takes a second.",
    buttons: ["Reload", "Later", "What's New"],
    defaultId: 0,
    cancelId: 1,
  };
}

function afterChoice(s, prompt, index, now) {
  const hidden = { ...s, showing: false };
  if (index === 0) {
    return { state: hidden, action: prompt.kind === "shell" ? "restart" : "reload" };
  }
  if (index === 1) {
    return { state: { ...hidden, laterKey: keyOf(prompt), laterUntil: now + LATER_MS }, action: "later" };
  }
  if (index === 2) {
    return { state: { ...hidden, focused: false }, action: "whatsNew" };
  }
  throw new RangeError(`Unknown alert button index: ${index}`);
}

function upToDateDetail(shellVersion, webBuild) {
  return `QTR ${shellVersion}, web ${webBuild || "unknown"}`;
}

module.exports = { upToDateDetail, RELEASE_NOTES_URL, LATER_MS, initialState, promptKey, nextPrompt, alertFor, afterChoice };
