const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { flavorOf, readServer, writeServer, serverOrigin, signInUrl, SERVERS, DEFAULT_SERVER } = require("../flavor");

test("flavorOf reads the packaged qtrFlavor, and QTR_FLAVOR only from source", () => {
  assert.strictEqual(flavorOf({ pkg: { qtrFlavor: "dev" }, env: {}, packaged: true }), "dev");
  assert.strictEqual(flavorOf({ pkg: {}, env: {}, packaged: true }), "prod");
  assert.strictEqual(flavorOf({ pkg: {}, env: { QTR_FLAVOR: "dev" }, packaged: false }), "dev");
  assert.strictEqual(flavorOf({ pkg: {}, env: { QTR_FLAVOR: "dev" }, packaged: true }), "prod");
  assert.strictEqual(flavorOf({ pkg: { qtrFlavor: "other" }, env: {}, packaged: true }), "prod");
});

test("the servers are local first, then dev.qtr.ai", () => {
  assert.strictEqual(DEFAULT_SERVER, "local");
  assert.deepStrictEqual(SERVERS.map(s => [s.id, s.label, s.origin]), [
    ["local", "Local (localhost:4100)", "http://localhost:4100"],
    ["dev", "dev.qtr.ai", "https://dev.qtr.ai"],
  ]);
  assert.strictEqual(serverOrigin("dev"), "https://dev.qtr.ai");
  assert.strictEqual(serverOrigin("nope"), "http://localhost:4100");
});

test("the chosen server survives a restart, and a missing or odd file means local", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qtr-dev-"));
  const file = path.join(dir, "server.json");
  assert.strictEqual(readServer(file), "local");
  writeServer(file, "dev");
  assert.strictEqual(readServer(file), "dev");
  fs.writeFileSync(file, JSON.stringify({ server: "https://evil.example" }));
  assert.strictEqual(readServer(file), "local");
  fs.writeFileSync(file, "not json");
  assert.strictEqual(readServer(file), "local");
});

test("signInUrl names the dev app so the page hands back to qtr-dev://", () => {
  assert.strictEqual(signInUrl("https://app.qtr.ai", "abc", "prod"), "https://app.qtr.ai/desktop-sign-in?state=abc");
  assert.strictEqual(signInUrl("http://localhost:4100", "abc", "dev"), "http://localhost:4100/desktop-sign-in?state=abc&app=dev");
});
