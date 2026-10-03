// LUMA — Scene Definitions
// Uses groups from config-store — if no groups are defined, falls back to all bulbs.
// Scenes apply to all bulbs by default.

const { setBulb, fadeBulb, setAll, sleep } = require("./bulbs");
const { lanSet } = require("./lanDaemon");
const { getBulbs, getGroups } = require("./config");

let activeTimers = [];
let loopInterval = null;

function clearActive() {
  activeTimers.forEach((t) => clearTimeout(t));
  activeTimers = [];
  if (loopInterval) { clearInterval(loopInterval); loopInterval = null; }
}

function later(ms, fn) {
  const t = setTimeout(fn, ms);
  activeTimers.push(t);
}

function getAllBulbIds() {
  return getBulbs().map((b) => b.id);
}

function getAllGroupBulbIds() {
  const groups = getGroups();
  if (groups.length) {
    const ids = new Set();
    groups.forEach((g) => g.bulbs.forEach((id) => ids.add(id)));
    return Array.from(ids);
  }
  return getAllBulbIds();
}

// Force white mode on all bulbs via LAN first, then cloud
async function forceWhite(bulbIds, brightness, colorTemp) {
  const ids = bulbIds || getAllGroupBulbIds();
  ids.forEach((id) => lanSet([id], { brightness, colorTemp }));
  await Promise.all(ids.map((id) =>
    setBulb(id, { power: true, brightness, colorTemp }).catch(() => {}),
  ));
}

const SCENES = {
  focus: async (io) => {
    clearActive();
    await forceWhite(getAllGroupBulbIds(), 1000, 800);
  },
  relax: async (io) => {
    clearActive();
    await forceWhite(getAllGroupBulbIds(), 350, 100);
  },
  bedtime: async (io) => {
    clearActive();
    const all = getAllGroupBulbIds();
    const bed = getBulbs().filter((b) => /bed/i.test(b.id)).map((b) => b.id);
    const others = all.filter((id) => !/bed/i.test(id));
    lanSet(others, { power: false });
    await forceWhite(bed.length ? bed : all, 150, 50);
    await Promise.all(others.map((id) => setBulb(id, { power: false }, io).catch(() => {})));
  },
  sleep: async (io) => {
    clearActive();
    const all = getAllGroupBulbIds();
    const bed = getBulbs().filter((b) => /bed/i.test(b.id)).map((b) => b.id);
    const others = all.filter((id) => !/bed/i.test(id));
    const sleepBulbs = bed.length ? bed : all;
    lanSet(others, { power: false });
    await forceWhite(sleepBulbs, 200, 30);
    await Promise.all(others.map((id) => setBulb(id, { power: false }, io).catch(() => {})));

    const totalMs = 30 * 60 * 1000;
    const steps = 190;
    const stepMs = totalMs / steps;
    let cur = 200;
    loopInterval = setInterval(async () => {
      cur--;
      if (cur <= 10) {
        lanSet(sleepBulbs, { power: false });
        await Promise.all(sleepBulbs.map((id) => setBulb(id, { power: false }, io).catch(() => {})));
        clearInterval(loopInterval);
        loopInterval = null;
        if (io) io.emit("scene:complete", { scene: "sleep" });
      } else {
        lanSet(sleepBulbs, { brightness: cur });
        await Promise.all(sleepBulbs.map((id) => setBulb(id, { brightness: cur }, io).catch(() => {})));
        if (io) io.emit("sleep:progress", { brightness: cur, total: 200 });
      }
    }, stepMs);
  },
  nightwalk: async (io) => {
    clearActive();
    const all = getAllGroupBulbIds();
    const bed = getBulbs().filter((b) => /bed/i.test(b.id)).map((b) => b.id);
    const others = all.filter((id) => !/bed/i.test(id));
    lanSet(bed, { power: false });
    await forceWhite(others, 80, 50);
    await Promise.all(bed.map((id) => setBulb(id, { power: false }, io).catch(() => {})));
  },
  morning: async (io) => {
    clearActive();
    const all = getAllGroupBulbIds();
    const bed = getBulbs().filter((b) => /bed/i.test(b.id)).map((b) => b.id);
    const others = all.filter((id) => !/bed/i.test(id));
    lanSet(others, { power: false });
    await forceWhite(bed, 10, 300);
    await Promise.all(others.map((id) => setBulb(id, { power: false }, io).catch(() => {})));
    fadeBulb(bed[0] || all[0], 800, 20 * 60 * 1000, 80);
    later(5 * 60 * 1000, () => {
      lanSet(others, { brightness: 600, colorTemp: 700 });
      Promise.all(others.map((id) =>
        setBulb(id, { power: true, brightness: 600, colorTemp: 700 }, io).catch(() => {}),
      ));
    });
  },
  movie: async (io) => {
    clearActive();
    const all = getAllGroupBulbIds();
    const first = all.slice(0, 1);
    const rest = all.slice(1);
    lanSet(first, { power: false });
    await forceWhite(rest, 30, 60);
    await setBulb(first[0], { power: false }, io).catch(() => {});
  },
  party: async (io) => {
    clearActive();
    const groups = getGroups();
    let hue = 0;
    loopInterval = setInterval(async () => {
      groups.forEach((g, i) => {
        const h = (hue + (360 * i) / groups.length) % 360;
        lanSet(g.bulbs, { color: { h, s: 1000, v: 1000 } });
      });
      hue = (hue + 4) % 360;
    }, 150);
  },
  off: async (io) => {
    clearActive();
    const all = getAllGroupBulbIds();
    lanSet(all, { power: false });
    await Promise.all(all.map((id) => setBulb(id, { power: false }, io).catch(() => {})));
  },
};

async function runScene(name, io) {
  if (!SCENES[name]) throw new Error(`Unknown scene: ${name}`);
  await SCENES[name](io);
}

module.exports = { runScene, cancelScenes: clearActive, SCENES };