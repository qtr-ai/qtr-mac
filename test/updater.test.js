const test = require("node:test");
const assert = require("node:assert");
const { findShipIt, parseElapsed } = require("../updater");

const SHIPIT = "/Users/me/Applications/QTR.app/Contents/Frameworks/Squirrel.framework/Resources/ShipIt ai.qtr.desktop.ShipIt /Users/me/Library/Caches/ai.qtr.desktop.ShipIt/ShipItState.plist";

test("parseElapsed reads ps elapsed times", () => {
  assert.strictEqual(parseElapsed("00:42"), 42 * 1000);
  assert.strictEqual(parseElapsed("01:30"), 90 * 1000);
  assert.strictEqual(parseElapsed("02:00:05"), (2 * 3600 + 5) * 1000);
  assert.strictEqual(parseElapsed("07-12:08:17"), (7 * 86400 + 12 * 3600 + 8 * 60 + 17) * 1000);
  assert.strictEqual(parseElapsed("ELAPSED"), null);
});

test("findShipIt finds this app's ShipIt and its age", () => {
  const out = [
    "  PID     ELAPSED COMMAND",
    "    1 07-12:08:17 /sbin/launchd",
    `92715       01:12 ${SHIPIT}`,
    "  400       00:03 /Applications/QTR.app/Contents/MacOS/QTR",
  ].join("\n");
  assert.deepStrictEqual(findShipIt(out), { pid: 92715, elapsedMs: 72 * 1000 });
});

test("findShipIt ignores other apps' ShipIt and unrelated processes", () => {
  const other = SHIPIT.replaceAll("ai.qtr.desktop", "com.example.other");
  const out = ["  PID     ELAPSED COMMAND", `  10 00:20 ${other}`, "  11 00:20 grep ai.qtr.desktop.ShipIt"].join("\n");
  assert.strictEqual(findShipIt(out), null);
  assert.strictEqual(findShipIt(""), null);
});

test("findShipIt reports a stuck ShipIt's age", () => {
  assert.deepStrictEqual(findShipIt(`  77    1-00:00:00 ${SHIPIT}\n`), { pid: 77, elapsedMs: 86400 * 1000 });
});
