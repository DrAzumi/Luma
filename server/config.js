const BULBS = [
  {
    id: "bedroom",
    name: "Bedroom",
    icon: "🛏",
    deviceId: "d7e7212acc0425c719jhzh",
    localKey: "YcWq_Bq2&=W7[aOh",
    ip: "192.168.1.4",
    version: "3.5",
  },
  {
    id: "hall",
    name: "Hall",
    icon: "🚪",
    deviceId: "d779f624e271236eeeiogr",
    localKey: "[d;/L.EBXQ@?&b_6",
    ip: "192.168.1.16",
    version: "3.5",
  },
  {
    id: "washingmachine",
    name: "Washing Machine",
    icon: "🫧",
    deviceId: "d75d679deb6e48e3c6ylwa",
    localKey: "JmPNyLh+Huf>_>Is",
    ip: "192.168.1.5",
    version: "3.5",
  },
  // Philips WiZ RGB E27 (LAN only)
  {
    id: "livingroom",
    name: "Living Room",
    icon: "🛋",
    ip: "192.168.1.6",
    protocol: "wiz",
  },
  {
    id: "bedroom_wiz",
    name: "Bedroom (WiZ)",
    icon: "💡",
    ip: "192.168.1.2",
    protocol: "wiz",
  },
];

// Confirmed DPS map from tinytuya polling
const DPS = {
  POWER: "20", // Boolean
  MODE: "21", // 'white' | 'colour' | 'scene' | 'music'
  BRIGHTNESS: "22", // Integer 10–1000
  COLOR_TEMP: "23", // Integer 0–1000 (0=warm, 1000=cool)
  COLOR: "24", // JSON {h:0-360, s:0-1000, v:0-1000}
  SCENE: "25", // JSON scene data
  COUNTDOWN: "26", // Integer seconds
  DO_NOT_DISTURB: "34", // Boolean
};

module.exports = { BULBS, DPS };
