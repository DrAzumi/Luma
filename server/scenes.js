const { setBulb, fadeBulb, setAll, sleep } = require("./bulbs");
const { lanSet } = require("./lanDaemon");

let activeTimers = [];
let loopInterval = null;

function clearActive() {
  activeTimers.forEach((t) => clearTimeout(t));
  activeTimers = [];
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
}

function later(ms, fn) {
  const t = setTimeout(fn, ms);
  activeTimers.push(t);
}

const ALL_BULBS = ["bedroom", "hall", "washingmachine", "livingroom", "bedroom_wiz"];

// Force white mode on all bulbs via LAN first, then cloud
async function forceWhite(bulbIds, brightness, colorTemp) {
  const ids = bulbIds || ALL_BULBS;
  // LAN: force white mode immediately
  ids.forEach((id) => lanSet([id], { brightness, colorTemp }));
  // Cloud: also update for UI state
  await Promise.all(
    ids.map((id) =>
      setBulb(id, { power: true, brightness, colorTemp }).catch(() => {}),
    ),
  );
}

const SCENES = {
  focus: async (io) => {
    clearActive();
    await forceWhite(ALL_BULBS, 1000, 800);
  },
  relax: async (io) => {
    clearActive();
    await forceWhite(ALL_BULBS, 350, 100);
  },
  bedtime: async (io) => {
    clearActive();
    lanSet(["hall", "washingmachine", "livingroom"], { power: false });
    await forceWhite(["bedroom", "bedroom_wiz"], 150, 50);
    await Promise.all(["hall", "washingmachine", "livingroom"].map((id) =>
      setBulb(id, { power: false }, io).catch(() => {}),
    ));
  },
  sleep: async (io) => {
    clearActive();
    lanSet(["hall", "washingmachine", "livingroom"], { power: false });
    await forceWhite(["bedroom", "bedroom_wiz"], 200, 30);
    await Promise.all(["hall", "washingmachine", "livingroom"].map((id) =>
      setBulb(id, { power: false }, io).catch(() => {}),
    ));

    const totalMs = 30 * 60 * 1000;
    const steps = 190;
    const stepMs = totalMs / steps;
    let cur = 200;
    loopInterval = setInterval(async () => {
      cur--;
      if (cur <= 10) {
        lanSet(["bedroom", "bedroom_wiz"], { power: false });
        await Promise.all(["bedroom", "bedroom_wiz"].map((id) =>
          setBulb(id, { power: false }, io).catch(() => {})));
        clearInterval(loopInterval);
        loopInterval = null;
        if (io) io.emit("scene:complete", { scene: "sleep" });
      } else {
        lanSet(["bedroom", "bedroom_wiz"], { brightness: cur });
        await Promise.all(["bedroom", "bedroom_wiz"].map((id) =>
          setBulb(id, { brightness: cur }, io).catch(() => {})));
        if (io) io.emit("sleep:progress", { brightness: cur, total: 200 });
      }
    }, stepMs);
  },
  nightwalk: async (io) => {
    clearActive();
    lanSet(["bedroom", "bedroom_wiz"], { power: false });
    await forceWhite(["hall", "washingmachine", "livingroom"], 80, 50);
    await Promise.all(["bedroom", "bedroom_wiz"].map((id) =>
      setBulb(id, { power: false }, io).catch(() => {})));
  },
  morning: async (io) => {
    clearActive();
    lanSet(["hall", "washingmachine", "livingroom"], { power: false });
    await forceWhite(["bedroom", "bedroom_wiz"], 10, 300);
    await Promise.all(["hall", "washingmachine", "livingroom"].map((id) =>
      setBulb(id, { power: false }, io).catch(() => {})));
    fadeBulb("bedroom", 800, 20 * 60 * 1000, 80);
    later(5 * 60 * 1000, () => {
      lanSet(["hall", "livingroom"], { brightness: 600, colorTemp: 700 });
      Promise.all(["hall", "livingroom"].map((id) =>
        setBulb(id, { power: true, brightness: 600, colorTemp: 700 }, io).catch(() => {})));
    });
  },
  movie: async (io) => {
    clearActive();
    lanSet(["washingmachine"], { power: false });
    await forceWhite(["bedroom", "bedroom_wiz"], 40, 80);
    await forceWhite(["hall", "livingroom"], 30, 60);
    await setBulb("washingmachine", { power: false }, io).catch(() => {});
  },
  party: async (io) => {
    clearActive();
    let hue = 0;
    loopInterval = setInterval(async () => {
      lanSet(["bedroom", "bedroom_wiz"], { color: { h: hue % 360, s: 1000, v: 1000 } });
      lanSet(["hall", "livingroom"], { color: { h: (hue + 120) % 360, s: 1000, v: 1000 } });
      lanSet(["washingmachine"], { color: { h: (hue + 240) % 360, s: 1000, v: 1000 } });
      hue = (hue + 4) % 360;
    }, 150);
  },
  off: async (io) => {
    clearActive();
    lanSet(ALL_BULBS, { power: false });
    await Promise.all(ALL_BULBS.map((id) =>
      setBulb(id, { power: false }, io).catch(() => {})));
  },
};

async function runScene(name, io) {
  if (!SCENES[name]) throw new Error(`Unknown scene: ${name}`);
  await SCENES[name](io);
}

module.exports = { runScene, cancelScenes: clearActive, SCENES };
