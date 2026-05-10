// ─────────────────────────────────────────────
//  LUMA — LAN Daemon Manager
//  Spawns persistent Python process, sends
//  commands via stdin. Zero per-command overhead.
// ─────────────────────────────────────────────

const { spawn } = require("child_process");
const path = require("path");

let daemon = null;
let ready = false;
let queue = [];

function start() {
  if (daemon) return;

  daemon = spawn("python3", [path.join(__dirname, "lan_daemon.py")], {
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

function stop() {
  if (daemon) {
    daemon.kill();
    daemon = null;
    ready = false;
  }
}

module.exports = { start, stop, lanSet };
