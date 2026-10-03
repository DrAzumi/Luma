// ─────────────────────────────────────────────
//  LUMA — LAN Daemon Manager
//  Spawns persistent Python process, sends
//  commands via stdin. Zero per-command overhead.
// ─────────────────────────────────────────────

const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Detect which Python has the required packages
function findPython() {
  const candidates = [
    "/Users/ayansharma/anaconda3/bin/python3",
    "/Users/ayansharma/anaconda3/bin/python",
    "python3",
    "python",
  ];
  for (const cmd of candidates) {
    if (cmd.includes("/") && !fs.existsSync(cmd)) continue;
    try {
      const r = spawnSync(cmd, ["-c", "import tinytuya"], { encoding: "utf8", timeout: 3000 });
      if (r.status === 0) {
        const ver = spawnSync(cmd, ["--version"], { encoding: "utf8" });
        console.log(`[LAN] Using Python: ${cmd} (${(ver.stdout || ver.stderr || "").trim()})`);
        return cmd;
      }
    } catch (_) {}
  }
  console.warn("[LAN] No Python with tinytuya found — trying python3");
  return "python3";
}

const PYTHON = findPython();

let daemon = null;
let ready = false;
let queue = [];

function start() {
  if (daemon) return;

  daemon = spawn(PYTHON, [path.join(__dirname, "lan_daemon.py")], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  daemon.stdout.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg === "ready") {
      ready = true;
      console.log("[LAN] Daemon ready — flushing queue");
      queue.forEach((cmd) => write(cmd));
      queue = [];
    }
  });

  daemon.stderr.on("data", (d) => {
    console.log("[LAN]", d.toString().trim());
  });

  daemon.on("close", (code) => {
    console.log(`[LAN] Daemon exited (${code}) — restarting in 2s`);
    daemon = null;
    ready = false;
    setTimeout(start, 2000);
  });

  console.log("[LAN] Starting daemon...");
}

function write(cmd) {
  if (!daemon || !ready) {
    queue.push(cmd);
    return;
  }
  try {
    daemon.stdin.write(JSON.stringify(cmd) + "\n");
  } catch (e) {
    console.log("[LAN] Write error:", e.message);
  }
}

function lanSet(bulbIds, params) {
  if (!Array.isArray(bulbIds)) bulbIds = [bulbIds];
  write({ bulbs: bulbIds, params });
}

function reloadConfig() {
  write({ reload: true });
  console.log("[LAN] Sent config reload signal");
}

function stop() {
  if (daemon) {
    daemon.kill();
    daemon = null;
    ready = false;
  }
}

module.exports = { start, stop, lanSet, reloadConfig, PYTHON };