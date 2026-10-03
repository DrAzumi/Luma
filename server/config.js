// LUMA — Bulb Configuration
// Loaded dynamically from config-store (bulbs-config.json).
// DPS map is static — it describes Tuya protocol data points.

const store = require("./config-store");

// Confirmed DPS map from tinytuya polling
const DPS = {
  POWER: "20",       // Boolean
  MODE: "21",        // 'white' | 'colour' | 'scene' | 'music'
  BRIGHTNESS: "22",  // Integer 10–1000
  COLOR_TEMP: "23",  // Integer 0–1000 (0=warm, 1000=cool)
  COLOR: "24",       // JSON {h:0-360, s:0-1000, v:0-1000}
  SCENE: "25",       // JSON scene data
  COUNTDOWN: "26",   // Integer seconds
  DO_NOT_DISTURB: "34", // Boolean
};

// Getters — always return the latest from config-store
function getBULBS() { return store.getBulbs(); }
function getGROUPS() { return store.getGroups(); }

module.exports = {
  get BULBS() { return store.getBulbs(); },
  get GROUPS() { return store.getGroups(); },
  getBulbs: () => store.getBulbs(),
  getGroups: () => store.getGroups(),
  DPS,
};