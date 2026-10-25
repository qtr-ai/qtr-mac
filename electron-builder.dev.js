// `npm run dist:dev`: QTR Dev, an unsigned arm64 build that sits beside QTR with its own identity and never updates.
const { build } = require("./package.json");

module.exports = {
  ...build,
  appId: "ai.qtr.desktop.dev",
  productName: "QTR Dev",
  icon: "build/icon-dev.icns",
  extraMetadata: { productName: "QTR Dev", qtrFlavor: "dev" },
  protocols: [{ name: "QTR Dev", schemes: ["qtr-dev"] }],
  mac: {
    ...build.mac,
    identity: null,
    notarize: false,
    target: [{ target: "dmg", arch: ["arm64"] }],
  },
  publish: null,
};
