// LUMA — BPM Engine v3
// Effect/palette/pattern changes NEVER restart interval
// Only BPM changes restart (unavoidable — timing is the interval)

const { lanSet } = require("./lanDaemon");
let _pauseFn = null,
  _resumeFn = null;
function setPauseHooks(pause, resume) {
  _pauseFn = pause;
  _resumeFn = resume;
}

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
  betos: [
    { h: 220, s: 700 },
    { h: 28, s: 900 },
    { h: 0, s: 1000 },
    { h: 270, s: 800 },
  ],
  warm: [
    { h: 0, s: 800 },
    { h: 20, s: 1000 },
    { h: 35, s: 900 },
    { h: 15, s: 800 },
  ],
  cool: [
    { h: 200, s: 1000 },
    { h: 220, s: 900 },
    { h: 240, s: 800 },
    { h: 180, s: 700 },
  ],
  neon: [
    { h: 300, s: 1000 },
    { h: 120, s: 1000 },
    { h: 60, s: 1000 },
    { h: 0, s: 1000 },
  ],
  mono: [
    { h: 220, s: 600 },
    { h: 220, s: 800 },
    { h: 220, s: 400 },
    { h: 220, s: 1000 },
  ],
  fire: [
    { h: 0, s: 1000 },
    { h: 10, s: 1000 },
    { h: 25, s: 1000 },
    { h: 355, s: 900 },
  ],
  // Album palettes
  currents: [
    { h: 350, s: 800 },
    { h: 185, s: 900 },
    { h: 30, s: 700 },
    { h: 275, s: 850 },
  ], // Tame Impala Currents: coral, teal, orange, violet
  lonerism: [
    { h: 210, s: 600 },
    { h: 95, s: 500 },
    { h: 55, s: 400 },
    { h: 330, s: 300 },
  ], // Lonerism: washed blue, sage, pale yellow, dusty rose
  slowrush: [
    { h: 35, s: 900 },
    { h: 15, s: 800 },
    { h: 200, s: 600 },
    { h: 45, s: 500 },
  ], // Slow Rush: amber, terracotta, sky, sand
  actuallife: [
    { h: 220, s: 1000 },
    { h: 0, s: 0 },
    { h: 210, s: 800 },
    { h: 240, s: 600 },
  ], // Fred again Actual Life: electric blue, white pulse, blue
  igor: [
    { h: 45, s: 900 },
    { h: 25, s: 1000 },
    { h: 280, s: 700 },
    { h: 350, s: 600 },
  ], // Tyler IGOR: yellow, orange, purple, pink
  blonde: [
    { h: 50, s: 300 },
    { h: 35, s: 400 },
    { h: 200, s: 200 },
    { h: 0, s: 0 },
  ], // Frank Ocean Blonde: soft gold, warm white, pale blue
};

// custom slot is overwritten by bpm:set-custom-palette — starts null so falls back to betos
PALETTES.custom = null;

function setCustomPalette(palette, io) {
  PALETTES.custom = palette;
  config.palette = "custom";
  spotifySync = true;
  if (io) io.emit("bpm:custom-palette-set", { palette });
}

const EFFECTS = {
  pulse: (b, intensity) => {
    const hi = Math.round(400 + intensity * 600);
    const lo = Math.round(40 + intensity * 100);
    const mid = Math.round(200 + intensity * 300);
    const step = b % 4;
    if (step === 0) return { wm: hi, bedroom: lo, hall: lo };
    if (step === 1) return { wm: lo, bedroom: mid, hall: mid };
    if (step === 2) return { wm: hi, bedroom: lo, hall: mid };
    return { wm: lo, bedroom: hi, hall: lo };
  },
  breathe: (b, intensity) => {
    const base = 200 + intensity * 400;
    const amp = intensity * 500;
    const clamp = (v) => Math.max(10, Math.min(1000, Math.round(v)));
    return {
      wm: clamp(base + amp * Math.sin((b * Math.PI * 2) / 4)),
      bedroom: clamp(
        base + amp * Math.sin((b * Math.PI * 2) / 4 + Math.PI * 0.66),
      ),
      hall: clamp(
        base + amp * Math.sin((b * Math.PI * 2) / 4 + Math.PI * 1.33),
      ),
    };
  },
  strobe: (b, intensity) => {
    const hi = Math.round(600 + intensity * 400);
    const lo = 40;
    const on = b % 2 === 0;
    return { wm: on ? hi : lo, bedroom: on ? lo : hi, hall: on ? hi : lo };
  },
  chase: (b, intensity) => {
    const hi = Math.round(600 + intensity * 400);
    const lo = Math.round(40 + intensity * 60);
    const step = b % 3;
    return {
      bedroom: step === 0 ? hi : lo,
      hall: step === 1 ? hi : lo,
      wm: step === 2 ? hi : lo,
    };
  },
  thumper: (b, intensity) => {
    const isBig = b % 4 === 0;
    const hi = Math.round(700 + intensity * 300);
    const lo = Math.round(80 + intensity * 120);
    const mid = Math.round(200 + intensity * 200);
    return {
      wm: isBig ? hi : lo,
      bedroom: isBig ? mid : lo + 20,
      hall: isBig ? lo : mid,
    };
  },
  ripple: (b, intensity) => {
    const hi = Math.round(500 + intensity * 500);
    const lo = Math.round(40 + intensity * 80);
    const phase = b % 6;
    return {
      bedroom: phase < 2 ? hi : lo,
      hall: phase >= 2 && phase < 4 ? hi : lo,
      wm: phase >= 4 ? hi : lo,
    };
  },
};

const PATTERNS = {
  counterpoint: (b) => ({
    wmPal: b % 4,
    bedPal: (b + 1) % 4,
    hallPal: (b + 2) % 4,
  }),
  unison: (b) => ({ wmPal: b % 4, bedPal: b % 4, hallPal: b % 4 }),
  chase: (b) => ({ wmPal: (b + 2) % 4, bedPal: b % 4, hallPal: (b + 1) % 4 }),
  split: (b) => ({ wmPal: b % 4, bedPal: (b + 2) % 4, hallPal: b % 4 }),
};

function onBeat(io) {
  const pal = PALETTES[config.palette] || PALETTES.betos;
  const effect = EFFECTS[config.effect] || EFFECTS.thumper;
  const pattern = PATTERNS[config.pattern] || PATTERNS.counterpoint;

  const brightness = effect(beat, config.intensity);
  const { wmPal, bedPal, hallPal } = pattern(beat);
  const hueShift = config.colorShift ? (beat * 6) % 360 : 0;
  const sh = (h) => Math.round((h + hueShift) % 360);

  // Send brightness via V channel of HSV — this is the key fix for bedroom
  // Always send all three together so no bulb gets starved
  lanSet(["washingmachine"], {
    color: {
      h: sh(pal[wmPal].h),
      s: pal[wmPal].s,
      v: Math.max(10, brightness.wm),
    },
  });
  lanSet(["bedroom"], {
    color: {
      h: sh(pal[bedPal].h),
      s: pal[bedPal].s,
      v: Math.max(10, brightness.bedroom),
    },
  });
  lanSet(["hall"], {
    color: {
      h: sh(pal[hallPal].h),
      s: pal[hallPal].s,
      v: Math.max(10, brightness.hall),
    },
  });
  // WiZ bulbs mirror their Tuya counterparts
  lanSet(["livingroom"], {
    color: {
      h: sh(pal[hallPal].h),
      s: pal[hallPal].s,
      v: Math.max(10, brightness.hall),
    },
  });
  lanSet(["bedroom_wiz"], {
    color: {
      h: sh(pal[bedPal].h),
      s: pal[bedPal].s,
      v: Math.max(10, brightness.bedroom),
    },
  });

  if (io) io.emit("bpm:beat", { beat, bpm: config.bpm });
  beat++;
}

function startInterval(io) {
  if (beatInterval) {
    clearInterval(beatInterval);
    beatInterval = null;
  }
  const ms = Math.round((60 / config.bpm) * 1000);
  onBeat(io); // fire immediately
  beatInterval = setInterval(() => onBeat(io), ms);
}

function start(cfg, io) {
  Object.assign(config, cfg);
  beat = 0;
  if (_pauseFn) _pauseFn();
  console.log(
    `[BPM] Starting at ${config.bpm} BPM (${Math.round((60 / config.bpm) * 1000)}ms) effect:${config.effect}`,
  );
  startInterval(io);
  if (io) io.emit("bpm:started", { bpm: config.bpm, config: { ...config } });
}

function update(cfg, io) {
  const bpmChanged = cfg.bpm !== undefined && cfg.bpm !== config.bpm;
  if (cfg.palette && cfg.palette !== "custom") spotifySync = false;
  Object.assign(config, cfg);
  if (bpmChanged) {
    console.log(
      `[BPM] BPM → ${config.bpm} (${Math.round((60 / config.bpm) * 1000)}ms)`,
    );
    startInterval(io); // only restart for BPM changes
  }
  // For all other changes (effect, palette, pattern, intensity) — no restart
  // config object is read fresh each beat so changes take effect immediately
  if (io) io.emit("bpm:updated", { ...config });
}

function stop(io) {
  if (beatInterval) {
    clearInterval(beatInterval);
    beatInterval = null;
  }
  beat = 0;
  spotifySync = false;
  if (_resumeFn) _resumeFn();
  if (io) io.emit("bpm:stopped", {});
}

function isRunning() {
  return beatInterval !== null;
}
function getConfig() {
  return { ...config, spotifySync };
}

module.exports = {
  start,
  stop,
  update,
  isRunning,
  getConfig,
  PALETTES,
  setPauseHooks,
  setCustomPalette,
};
