// ─────────────────────────────────────────────
//  LUMA — Song Cue Player
//  Uses LAN daemon for zero-latency firing
//  Falls back to cloud if LAN not available
// ─────────────────────────────────────────────

const { setBulb } = require("./bulbs"); // cloud fallback
const { lanSet } = require("./lanDaemon"); // LAN primary
const fs = require("fs");
const path = require("path");

const ALL = ["bedroom", "hall", "washingmachine"];
const USE_LAN = true; // set false to force cloud

let cueTimers = [],
  progTimer = null;
let isPlaying = false,
  currentSong = null,
  startTime = null;

function clearAll() {
  cueTimers.forEach((t) => clearTimeout(t));
  cueTimers = [];
  if (progTimer) {
    clearInterval(progTimer);
    progTimer = null;
  }
}

function paramsFromCue(cue) {
  const p = {};
  if (cue.power !== undefined) p.power = cue.power;
  if (cue.brightness !== undefined) p.brightness = cue.brightness;
  if (cue.colorTemp !== undefined) p.colorTemp = cue.colorTemp;
  if (cue.hue !== undefined)
    p.color = {
      h: cue.hue,
      s: Math.round((cue.saturation ?? 1) * 1000),
      v: Math.round((cue.value ?? 1) * 1000),
    };
  return p;
}

function executeCue(cue) {
  const targets = cue.bulbs || ALL;
  const params = paramsFromCue(cue);

  if (USE_LAN) {
    // LAN: one call, all targets, ~30ms
    lanSet(targets, params);
  } else {
    // Cloud fallback: parallel but rate-limited
    targets.forEach((id) => setBulb(id, params).catch(() => {}));
  }
}

function loadSong(name) {
  const p = path.join(__dirname, "..", "songs", `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Song not found: ${name}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listSongs() {
  const dir = path.join(__dirname, "..", "songs");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      return {
        id: f.replace(".json", ""),
        title: d.title,
        artist: d.artist,
        duration: d.duration,
      };
    });
}

function play(songName, io, offsetMs = 0) {
  stop();
  const song = loadSong(songName);
  currentSong = song;
  isPlaying = true;
  startTime = Date.now() - offsetMs;

  if (io)
    io.emit("song:started", {
      song: songName,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
    });

  console.log(
    `[LUMA] ▶ "${song.title}" via ${USE_LAN ? "LAN" : "Cloud"} — ${song.cues.length} cues`,
  );

  const sorted = [...song.cues].sort((a, b) => a.time - b.time);

  // LAN needs no pre-compensation. Cloud needs ~320ms.
  const COMP = USE_LAN ? 0 : 320;

  sorted.forEach((cue) => {
    const fireAt = Math.max(0, cue.time * 1000 - offsetMs - COMP);
    const t = setTimeout(() => {
      executeCue(cue);
      if (io)
        io.emit("song:cue", {
          label: cue.label,
          elapsed: Date.now() - startTime,
        });
    }, fireAt);
    cueTimers.push(t);
  });

  progTimer = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    if (io) io.emit("song:progress", { elapsed, duration: song.duration });
    if (elapsed >= song.duration) stop(io);
  }, 500);
}

function stop(io) {
  clearAll();
  isPlaying = false;
  if (io && currentSong) io.emit("song:stopped", {});
  currentSong = null;
}

function getStatus() {
  return {
    isPlaying,
    song: currentSong
      ? { title: currentSong.title, artist: currentSong.artist }
      : null,
    elapsed: startTime ? (Date.now() - startTime) / 1000 : 0,
  };
}

module.exports = { play, stop, getStatus, listSongs };
