const test = require("node:test");
const assert = require("node:assert");
const { RELEASE_NOTES_URL, LATER_MS, initialState, promptKey, nextPrompt, alertFor, afterChoice, upToDateDetail } = require("../promptState");

const ready = (over = {}) => ({ ...initialState(), focused: true, quiet: true, ...over });
const T0 = 1_000_000_000_000;

test("constants match the spec", () => {
  assert.strictEqual(RELEASE_NOTES_URL, "https://qtr.ai/releasenotes");
  assert.strictEqual(LATER_MS, 14_400_000);
  assert.deepStrictEqual(initialState(), { web: null, shell: null, quiet: true, focused: false, showing: false, laterKey: null, laterUntil: 0 });
});

test("promptKey prefers shell and is null when nothing is pending", () => {
  assert.strictEqual(promptKey(initialState()), null);
  assert.strictEqual(promptKey({ ...initialState(), web: "abc1234" }), "web:abc1234");
  assert.strictEqual(promptKey({ ...initialState(), web: "abc1234", shell: "0.2.2" }), "shell:0.2.2");
});

test("nothing pending gives no prompt", () => {
  assert.strictEqual(nextPrompt(ready(), T0), null);
});

test("a pending web build shows when focused and quiet", () => {
  assert.deepStrictEqual(nextPrompt(ready({ web: "abc1234" }), T0), { kind: "web", build: "abc1234" });
});

test("no prompt while not quiet, not focused, or already showing", () => {
  const s = ready({ web: "abc1234" });
  assert.strictEqual(nextPrompt({ ...s, quiet: false }, T0), null);
  assert.strictEqual(nextPrompt({ ...s, focused: false }, T0), null);
  assert.strictEqual(nextPrompt({ ...s, showing: true }, T0), null);
});

test("shell prompt wins over a pending web build", () => {
  assert.deepStrictEqual(nextPrompt(ready({ web: "abc1234", shell: "0.2.2" }), T0), { kind: "shell", version: "0.2.2" });
});

test("later holds the prompt for 4 hours, then it is due again", () => {
  const s = ready({ web: "abc1234", laterKey: "web:abc1234", laterUntil: T0 + LATER_MS });
  assert.strictEqual(nextPrompt(s, T0 + LATER_MS - 1), null);
  assert.deepStrictEqual(nextPrompt(s, T0 + LATER_MS), { kind: "web", build: "abc1234" });
});

test("a new web build after a later prompt is due at once", () => {
  const s = ready({ web: "def5678", laterKey: "web:abc1234", laterUntil: T0 + LATER_MS });
  assert.deepStrictEqual(nextPrompt(s, T0 + 1), { kind: "web", build: "def5678" });
});

test("a new shell version after a later prompt is due at once", () => {
  const s = ready({ shell: "0.2.3", web: "abc1234", laterKey: "shell:0.2.2", laterUntil: T0 + LATER_MS });
  assert.deepStrictEqual(nextPrompt(s, T0 + 1), { kind: "shell", version: "0.2.3" });
});

test("alertFor gives the exact web copy", () => {
  assert.deepStrictEqual(alertFor({ kind: "web", build: "abc1234" }), {
    message: "QTR has been updated",
    detail: "Reload to get the latest. It takes a second.",
    buttons: ["Reload", "Later", "What's New"],
    defaultId: 0,
    cancelId: 1,
  });
});

test("alertFor gives the exact shell copy", () => {
  assert.deepStrictEqual(alertFor({ kind: "shell", version: "0.2.2" }), {
    message: "A new version of QTR is ready",
    detail: "Version 0.2.2 installs when you restart.",
    buttons: ["Restart to update", "Later", "What's New"],
    defaultId: 0,
    cancelId: 1,
  });
});

test("choosing restart or reload hides the alert and keeps the pending update", () => {
  const s = ready({ web: "abc1234", showing: true });
  const web = afterChoice(s, { kind: "web", build: "abc1234" }, 0, T0);
  assert.deepStrictEqual(web, { state: { ...s, showing: false }, action: "reload" });
  const shellState = ready({ shell: "0.2.2", showing: true });
  assert.deepStrictEqual(afterChoice(shellState, { kind: "shell", version: "0.2.2" }, 0, T0), {
    state: { ...shellState, showing: false },
    action: "restart",
  });
});

test("later records the prompt key and a 4 hour hold", () => {
  const s = ready({ web: "abc1234", showing: true });
  const { state, action } = afterChoice(s, { kind: "web", build: "abc1234" }, 1, T0);
  assert.strictEqual(action, "later");
  assert.deepStrictEqual(state, { ...s, showing: false, laterKey: "web:abc1234", laterUntil: T0 + LATER_MS });
  assert.strictEqual(nextPrompt({ ...state, focused: true }, T0 + 1), null);
});

test("what's new hides the alert and waits for a real refocus", () => {
  const s = ready({ web: "abc1234", showing: true });
  const { state, action } = afterChoice(s, { kind: "web", build: "abc1234" }, 2, T0);
  assert.strictEqual(action, "whatsNew");
  assert.strictEqual(nextPrompt(state, T0), null);
  assert.deepStrictEqual(nextPrompt({ ...state, focused: true }, T0), { kind: "web", build: "abc1234" });
});

test("afterChoice does not mutate its input", () => {
  const s = ready({ web: "abc1234", showing: true });
  const copy = JSON.stringify(s);
  afterChoice(s, { kind: "web", build: "abc1234" }, 1, T0);
  assert.strictEqual(JSON.stringify(s), copy);
});

test("upToDateDetail names the app and web versions, web unknown when the page didn't answer", () => {
  assert.strictEqual(upToDateDetail("0.3.0", "a1b2c3d"), "QTR 0.3.0, web a1b2c3d");
  assert.strictEqual(upToDateDetail("0.3.0", null), "QTR 0.3.0, web unknown");
});
