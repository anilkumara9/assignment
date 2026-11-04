// Tiny JSON-file store. Library guides ship in /guides; live-generated guides
// land in /data/generated so a restart never loses a shared link.
const fs = require("fs");
const path = require("path");

const LIB_DIR = path.join(__dirname, "..", "guides");
const GEN_DIR = path.join(__dirname, "..", "data", "generated");

function ensure() { fs.mkdirSync(GEN_DIR, { recursive: true }); }

function loadLibrary() {
  return fs.readdirSync(LIB_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(LIB_DIR, f), "utf8")));
}

function saveGenerated(guide) {
  ensure();
  fs.writeFileSync(path.join(GEN_DIR, guide.id + ".json"), JSON.stringify(guide, null, 2));
}

function get(id) {
  for (const g of loadLibrary()) if (g.id === id) return g;
  ensure();
  const p = path.join(GEN_DIR, id + ".json");
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  return null;
}

module.exports = { loadLibrary, saveGenerated, get };
