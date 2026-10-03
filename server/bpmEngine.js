// LUMA — BPM Engine v4
// Effect/palette/pattern changes NEVER restart interval
// Only BPM changes restart (unavoidable — timing is the interval)
// Groups: patterns/effects assign slots to groups instead of hardcoded bulbs

const { lanSet } = require("./lanDaemon");
const { getGroups } = require("./config");
let _pauseFn = null, _resumeFn = null;
function setPauseHooks(pause, resume) { _pauseFn = pause; _resumeFn = resume; }

let beatInterval = null;
let beat = 0;
let spotifySync = false;

const config = {
  bpm: 129,
  palette: "betos",
  pattern: "counterpoint",
  intensity: 0.8,
  colorShift: false,
  effect: "thumper",
};

const PALETTES = {
  betos: [{ h: 220, s: 700 }, { h: 28, s: 900 }, { h: 0, s: 1000 }, { h: 270, s: 800 }],
  warm: [{ h: 0, s: 800 }, { h: 20, s: 1000 }, { h: 35, s: 900 }, { h: 15, s: 800 }],
  cool: [{ h: 200, s: 1000 }, { h: 220, s: 900 }, { h: 240, s: 800 }, { h: 180, s: 700 }],
  neon: [{ h: 300, s: 1000 }, { h: 120, s: 1000 }, { h: 60, s: 1000 }, { h: 0, s: 1000 }],
  mono: [{ h: 220, s: 600 }, { h: 220, s: 800 }, { h: 220, s: 400 }, { h: 220, s: 1000 }],
  fire: [{ h: 0, s: 1000 }, { h: 10, s: 1000 }, { h: 25, s: 1000 }, { h: 355, s: 900 }],
  currents: [{ h: 350, s: 800 }, { h: 185, s: 900 }, { h: 30, s: 700 }, { h: 275, s: 850 }],
  lonerism: [{ h: 210, s: 600 }, { h: 95, s: 500 }, { h: 55, s: 400 }, { h: 330, s: 300 }],
  slowrush: [{ h: 35, s: 900 }, { h: 15, s: 800 }, { h: 200, s: 600 }, { h: 45, s: 500 }],
  actuallife: [{ h: 220, s: 1000 }, { h: 0, s: 0 }, { h: 210, s: 800 }, { h: 240, s: 600 }],
  igor: [{ h: 45, s: 900 }, { h: 25, s: 1000 }, { h: 280, s: 700 }, { h: 350, s: 600 }],
  blonde: [{ h: 50, s: 300 }, { h: 35, s: 400 }, { h: 200, s: 200 }, { h: 0, s: 0 }],
};
PALETTES.custom = null;
function setCustomPalette(palette, io) {
  PALETTES.custom = palette;
  config.palette = "custom";
  spotifySync = true;
  if (io) io.emit("bpm:custom-palette-set", { palette });
}

// ── Effects ── each returns brightness per group slot ──────────────────────────
// Slots 0, 1, 2 map to the first 3 groups

const EFFECTS = {
  pulse: (b, intensity) => {
    const hi = Math.round(400 + intensity * 600);
    const lo = Math.round(40 + intensity * 100);
    const mid = Math.round(200 + intensity * 300);
    const step = b % 4;
    if (step === 0) return [hi, lo, lo];
    if (step === 1) return [lo, mid, mid];
    if (step === 2) return [hi, lo, mid];
    return [lo, hi, lo];
  },
  breathe: (b, intensity) => {
    const base = 200 + intensity * 400;
    const amp = intensity * 500;
    const clamp = (v) => Math.max(10, Math.min(1000, Math.round(v)));
    return [
      clamp(base + amp * Math.sin((b * Math.PI * 2) / 4)),
      clamp(base + amp * Math.sin((b * Math.PI * 2) / 4 + Math.PI * 0.66)),
      clamp(base + amp * Math.sin((b * Math.PI * 2) / 4 + Math.PI * 1.33)),
    ];
  },
  strobe: (b, intensity) => {
    const hi = Math.round(600 + intensity * 400);
    const lo = 40;
    const on = b % 2 === 0;
    return [on ? hi : lo, on ? lo : hi, on ? hi : lo];
  },
  chase: (b, intensity) => {
    const hi = Math.round(600 + intensity * 400);
    const lo = Math.round(40 + intensity * 60);
    const step = b % 3;
    return [
      step === 0 ? hi : lo,
      step === 1 ? hi : lo,
      step === 2 ? hi : lo,
    ];
  },
  thumper: (b, intensity) => {
    const isBig = b % 4 === 0;
    const hi = Math.round(700 + intensity * 300);
    const lo = Math.round(80 + intensity * 120);
    const mid = Math.round(200 + intensity * 200);
    return [isBig ? hi : lo, isBig ? mid : lo + 20, isBig ? lo : mid];
  },
  ripple: (b, intensity) => {
    const hi = Math.round(500 + intensity * 500);
    const lo = Math.round(40 + intensity * 80);
    const phase = b % 6;
    return [phase < 2 ? hi : lo, phase >= 2 && phase < 4 ? hi : lo, phase >= 4 ? hi : lo];
  },
};

// ── Patterns ── each returns palette index per group slot ─────────────────────
// Slots 0, 1, 2 map to the first 3 groups

const PATTERNS = {
  counterpoint: (b) => [b % 4, (b + 1) % 4, (b + 2) % 4],
  unison: (b) => [b % 4, b % 4, b % 4],
  chase: (b) => [b % 4, (b + 1) % 4, (b + 2) % 4],
  split: (b) => [b % 4, (b + 2) % 4, b % 4],
};

// ── Beat handler ──────────────────────────────────────────────────────────────

function onBeat(io) {
  const groups = getGroups();

  // Strobe White — true blackout strobe, bypasses palette/pattern entirely
  if (config.effect === "strobeWhite") {
    const on = beat % 2 === 0;
    groups.forEach((group) => {
      group.bulbs.forEach((id) => {
        if (on) lanSet([id], { power: true, color: { h: 0, s: 0, v: 1000 } });
        else lanSet([id], { power: false });
      });
    });
    if (io) io.emit("bpm:beat", { beat, bpm: config.bpm });
    beat++;
    return;
  }

  const pal = PALETTES[config.palette] || PALETTES.betos;
  const effect = EFFECTS[config.effect] || EFFECTS.thumper;
  const pattern = PATTERNS[config.pattern] || PATTERNS.counterpoint;

  const briArr = effect(beat, config.intensity);
  const palArr = pattern(beat);
  const hueShift = config.colorShift ? (beat * 6) % 360 : 0;
  const sh = (h) => Math.round((h + hueShift) % 360);

  // Map each group to a slot (0, 1, 2 — repeats slot 2 for extras)
  groups.forEach((group, i) => {
    const slot = Math.min(i, 2);
    const palIdx = palArr[slot] || 0;
    const bri = briArr[slot] || 0;
    group.bulbs.forEach((id) => {
      lanSet([id], {
        color: {
          h: sh(pal[palIdx].h),
          s: pal[palIdx].s,
          v: Math.max(10, bri),
        },
      });
    });
  });

  if (io) io.emit("bpm:beat", { beat, bpm: config.bpm });
  beat++;
}

function startInterval(io) {
  if (beatInterval) { clearInterval(beatInterval); beatInterval = null; }
  const ms = Math.round((60 / config.bpm) * 1000);
  onBeat(io);
  beatInterval = setInterval(() => onBeat(io), ms);
}

function start(cfg, io) {
  Object.assign(config, cfg);
  beat = 0;
  if (_pauseFn) _pauseFn();
  console.log(`[BPM] Starting at ${config.bpm} BPM (${Math.round((60/config.bpm)*1000)}ms) effect:${config.effect} groups:${getGroups().length}`);
  startInterval(io);
  if (io) io.emit("bpm:started", { bpm: config.bpm, config: { ...config } });
}

function update(cfg, io) {
  const bpmChanged = cfg.bpm !== undefined && cfg.bpm !== config.bpm;
  if (cfg.palette && cfg.palette !== "custom") spotifySync = false;
  Object.assign(config, cfg);
  if (bpmChanged) {
    console.log(`[BPM] BPM → ${config.bpm} (${Math.round((60/config.bpm)*1000)}ms)`);
    startInterval(io);
  }
  if (io) io.emit("bpm:updated", { ...config });
}

function stop(io) {
  if (beatInterval) { clearInterval(beatInterval); beatInterval = null; }
  beat = 0;
  spotifySync = false;
  if (_resumeFn) _resumeFn();
  if (io) io.emit("bpm:stopped", {});
}

function isRunning() { return beatInterval !== null; }
function getConfig() { return { ...config, spotifySync }; }

module.exports = {
  start, stop, update, isRunning, getConfig,
  PALETTES, setPauseHooks, setCustomPalette,
};