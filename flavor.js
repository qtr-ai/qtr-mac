const fs = require("fs");

// QTR Dev is built from the same code; `npm run dist:dev` stamps qtrFlavor into the packaged package.json.
const flavorOf = ({ pkg, env, packaged }) =>
  pkg.qtrFlavor === "dev" || (!packaged && env.QTR_FLAVOR === "dev") ? "dev" : "prod";

const SERVERS = [
  { id: "local", label: "Local (localhost:4100)", origin: "http://localhost:4100" },
  { id: "dev", label: "dev.qtr.ai", origin: "https://dev.qtr.ai" },
];
const DEFAULT_SERVER = "local";

const serverOrigin = id => (SERVERS.find(s => s.id === id) ?? SERVERS[0]).origin;

const readServer = file => {
  try {
    const { server } = JSON.parse(fs.readFileSync(file, "utf8"));
    return SERVERS.some(s => s.id === server) ? server : DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
};

const writeServer = (file, id) => {
  try { fs.writeFileSync(file, JSON.stringify({ server: id })); } catch { /* best effort */ }
};

const signInUrl = (origin, state, flavor) =>
  `${origin}/desktop-sign-in?state=${state}${flavor === "dev" ? "&app=dev" : ""}`;

module.exports = { flavorOf, SERVERS, DEFAULT_SERVER, serverOrigin, readServer, writeServer, signInUrl };
