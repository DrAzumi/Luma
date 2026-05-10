#!/usr/bin/env node
// LUMA — First-run setup wizard

const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "server", "config.js");
const DAEMON_PATH = path.join(ROOT, "server", "lan_daemon.py");
const ENV_PATH = path.join(ROOT, ".env");
const DEVICES_JSON = path.join(ROOT, "devices.json");

const IS_WIN = process.platform === "win32";
const DEFAULT_PYTHON = IS_WIN ? "python" : "python3";
const DEFAULT_PIP = IS_WIN ? "pip" : "pip3";

// ── Low-level helpers ─────────────────────────────────────────────────────────

function printStep(chalk, n, title) {
  console.log(
    "\n" +
    chalk.bold.yellow("── Step " + n + ": " + title + " ") +
    chalk.yellow("─".repeat(Math.max(0, 42 - title.length))),
  );
}

function ok(chalk, label) { console.log("  " + chalk.green("✓") + "  " + label); }
function fail(chalk, label) { console.log("  " + chalk.red("✗") + "  " + label); }

// Write a temp .py file, run it, delete it — avoids all shell-escaping issues
function runPythonScript(pythonCmd, script, args, timeoutMs) {
  if (!args) args = [];
  if (!timeoutMs) timeoutMs = 25000;
  const tmp = path.join(os.tmpdir(), "luma_setup_" + Date.now() + ".py");
  fs.writeFileSync(tmp, script, "utf8");
  try {
    return spawnSync(pythonCmd, [tmp].concat(args), { encoding: "utf8", timeout: timeoutMs });
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

// Run a command with inherited stdio (for interactive subprocesses like tinytuya wizard)
function runInteractive(cmd, args) {
  return new Promise(function(resolve) {
    var proc = spawn(cmd, args, { stdio: "inherit", shell: IS_WIN });
    proc.on("close", resolve);
    proc.on("error", function() { resolve(1); });
  });
}

// ── LAN discovery ─────────────────────────────────────────────────────────────

function scanTuya(pythonCmd) {
  var script = [
    "import tinytuya, json, sys",
    "try:",
    "    result = tinytuya.deviceScan(verbose=False, maxretry=3)",
    "    devices = []",
    "    for k, v in result.items():",
    "        ip = v.get('ip', '')",
    "        gwId = v.get('gwId', k)",
    "        if ip:",
    "            devices.append({'gwId': gwId, 'ip': ip, 'version': str(v.get('version', '3.3'))})",
    "    print(json.dumps(devices))",
    "except Exception as e:",
    "    sys.stderr.write(str(e) + '\\n')",
    "    print('[]')",
  ].join("\n");

  var r = runPythonScript(pythonCmd, script, [], 30000);
  try {
    var parsed = JSON.parse((r.stdout || "").trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function scanWiz(pythonCmd, broadcast) {
  var script = [
    "import asyncio, json, sys",
    "try:",
    "    from pywizlight.discovery import find_wizlights",
    "    broadcast = sys.argv[1] if len(sys.argv) > 1 else '192.168.1.255'",
    "    async def scan():",
    "        lights = await find_wizlights(wait_time=6, broadcast_address=broadcast)",
    "        result = [{'ip': l.ip_address, 'mac': l.mac_address or ''} for l in lights]",
    "        print(json.dumps(result))",
    "    asyncio.run(scan())",
    "except Exception as e:",
    "    sys.stderr.write(str(e) + '\\n')",
    "    print('[]')",
  ].join("\n");

  var r = runPythonScript(pythonCmd, script, [broadcast], 20000);
  try {
    var parsed = JSON.parse((r.stdout || "").trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

// ── Config reading/writing ────────────────────────────────────────────────────

function readLocalKeys(devicesJsonPath) {
  var keys = {};
  try {
    var data = JSON.parse(fs.readFileSync(devicesJsonPath, "utf8"));
    var list = Array.isArray(data) ? data : Object.values(data);
    list.forEach(function(entry) {
      var id = entry.id || entry.gwId;
      var key = entry.key || entry.localKey;
      if (id && key) keys[id] = key;
    });
  } catch (_) {}
  return keys;
}

function parseEnvFile(envPath) {
  var out = {};
  try {
    fs.readFileSync(envPath, "utf8").split("\n").forEach(function(line) {
      var m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    });
  } catch (_) {}
  return out;
}

function writeEnvFile(envPath, updates, chalk) {
  var existing = parseEnvFile(envPath);
  var merged = Object.assign({}, existing, updates);
  var lines = Object.entries(merged).map(function(kv) { return kv[0] + "=" + kv[1]; });
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
  ok(chalk, "Wrote " + path.relative(ROOT, envPath));
}

function writeConfigJs(configPath, bulbs, chalk) {
  var entries = bulbs.map(function(b) {
    if (b.protocol === "wiz") {
      return (
        "  {\n" +
        "    id: \"" + b.id + "\",\n" +
        "    name: \"" + b.name + "\",\n" +
        "    icon: \"" + b.icon + "\",\n" +
        "    ip: \"" + b.ip + "\",\n" +
        "    protocol: \"wiz\",\n" +
        "  }"
      );
    }
    return (
      "  {\n" +
      "    id: \"" + b.id + "\",\n" +
      "    name: \"" + b.name + "\",\n" +
      "    icon: \"" + b.icon + "\",\n" +
      "    deviceId: \"" + b.gwId + "\",\n" +
      "    localKey: \"" + (b.localKey || "") + "\",\n" +
      "    ip: \"" + b.ip + "\",\n" +
      "    version: \"" + (b.version || "3.5") + "\",\n" +
      "  }"
    );
  });

  var content =
    "const BULBS = [\n" +
    entries.join(",\n") +
    (entries.length ? ",\n" : "") +
    "];\n\n" +
    "const DPS = {\n" +
    "  POWER: \"20\",\n" +
    "  MODE: \"21\",\n" +
    "  BRIGHTNESS: \"22\",\n" +
    "  COLOR_TEMP: \"23\",\n" +
    "  COLOR: \"24\",\n" +
    "  SCENE: \"25\",\n" +
    "  COUNTDOWN: \"26\",\n" +
    "  DO_NOT_DISTURB: \"34\",\n" +
    "};\n\n" +
    "module.exports = { BULBS, DPS };\n";

  fs.writeFileSync(configPath, content, "utf8");
  ok(chalk, "Wrote " + path.relative(ROOT, configPath));
}

// Replace a top-level Python dict in a file by scanning for balanced braces
function updatePythonDict(content, varName, pyEntries) {
  var lines = content.split("\n");
  var start = -1, depth = 0, end = -1;
  for (var i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i].trim().startsWith(varName + " = {")) {
      start = i;
      depth = 0;
    }
    if (start !== -1) {
      depth += (lines[i].match(/{/g) || []).length;
      depth -= (lines[i].match(/}/g) || []).length;
      if (depth === 0 && i >= start) { end = i; break; }
    }
  }
  if (start === -1 || end === -1) return content;
  var newBlock = [varName + " = {"].concat(pyEntries).concat(["}"]);
  return lines.slice(0, start).concat(newBlock).concat(lines.slice(end + 1)).join("\n");
}

function updateDaemonConfig(tuyaBulbs, wizBulbs, chalk) {
  if (!fs.existsSync(DAEMON_PATH)) return;
  var content = fs.readFileSync(DAEMON_PATH, "utf8");

  if (tuyaBulbs.length > 0) {
    var tuyaEntries = tuyaBulbs.map(function(b) {
      var safeKey = (b.localKey || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      return "    '" + b.id + "': {'id': '" + b.gwId + "', 'key': '" + safeKey + "', 'ip': '" + b.ip + "'},";
    });
    content = updatePythonDict(content, "BULBS_CFG", tuyaEntries);
  }

  if (wizBulbs.length > 0) {
    var wizEntries = wizBulbs.map(function(b) {
      return "    '" + b.id + "': {'ip_address': '" + b.ip + "', 'mac_address': '" + (b.mac || "") + "'},";
    });
    content = updatePythonDict(content, "WIZ_CFG", wizEntries);
  }

  fs.writeFileSync(DAEMON_PATH, content, "utf8");
  ok(chalk, "Updated " + path.relative(ROOT, DAEMON_PATH) + " (BULBS_CFG / WIZ_CFG)");
}

// Flash a Tuya bulb red for 2 seconds using tinytuya
function flashBulbRed(pythonCmd, bulb) {
  var script = [
    "import tinytuya, time, sys",
    "try:",
    "    d = tinytuya.BulbDevice(",
    "        dev_id=sys.argv[1], address=sys.argv[2],",
    "        local_key=sys.argv[3], version=float(sys.argv[4]),",
    "    )",
    "    d.set_socketTimeout(2)",
    "    d.set_socketRetryLimit(1)",
    "    d.set_colour(255, 0, 0)",
    "    time.sleep(2)",
    "    d.set_white_percentage(50, 50)",
    "except Exception as e:",
    "    sys.stderr.write(str(e) + '\\n')",
  ].join("\n");
  runPythonScript(
    pythonCmd, script,
    [bulb.gwId, bulb.ip, bulb.localKey || "", bulb.version || "3.5"],
    8000,
  );
}

var ROOM_ICONS = {
  bedroom: "🛏", hall: "🚪", livingroom: "🛋", lounge: "🛋",
  kitchen: "🍳", bathroom: "🚿", office: "💼", study: "📚",
  washingmachine: "🫧", laundry: "🫧", garage: "🏠",
  garden: "🌿", outdoor: "🌿", dining: "🍽",
};

// ── Main wizard ───────────────────────────────────────────────────────────────

async function main() {
  var chalk = (await import("chalk")).default;
  var inquirer = (await import("inquirer")).default;

  console.log();
  console.log(chalk.bold.yellow("╔══════════════════════════════════════════╗"));
  console.log(chalk.bold.yellow("║") + chalk.bold("  🌕  LUMA — First-Run Setup Wizard        ") + chalk.bold.yellow("║"));
  console.log(chalk.bold.yellow("╚══════════════════════════════════════════╝"));

  if (fs.existsSync(CONFIG_PATH)) {
    console.log(chalk.yellow("\n  server/config.js already exists."));
    var ans0 = await inquirer.prompt([{
      type: "confirm", name: "proceed",
      message: "Overwrite with new setup?",
      default: false,
    }]);
    if (!ans0.proceed) {
      console.log(chalk.gray("  Cancelled — existing config unchanged.\n"));
      process.exit(0);
    }
  }

  // ── Step 1: Prerequisites ──────────────────────────────────────────────────
  printStep(chalk, 1, "Prerequisites");

  var nodeVer = process.versions.node.split(".").map(Number);
  var nodeOk = nodeVer[0] >= 16;
  nodeOk ? ok(chalk, "Node.js v" + process.versions.node) : fail(chalk, "Node.js v" + process.versions.node + " — need 16+");
  if (!nodeOk) { console.log(chalk.red("  → Download from https://nodejs.org")); process.exit(1); }

  // Detect Python — auto, then let user override if packages are missing
  var pythonCmd = DEFAULT_PYTHON;
  var pyCheck = spawnSync(DEFAULT_PYTHON, ["--version"], { encoding: "utf8" });
  if (pyCheck.status !== 0) {
    fail(chalk, "Python not found (tried '" + DEFAULT_PYTHON + "')");
    console.log(chalk.red("  → Install Python 3 from https://python.org"));
    if (IS_WIN) console.log(chalk.red("  → Or: winget install Python.Python.3"));
    process.exit(1);
  }
  ok(chalk, (pyCheck.stdout || pyCheck.stderr || "").trim());

  var tinyOk = spawnSync(pythonCmd, ["-c", "import tinytuya"], { encoding: "utf8" }).status === 0;
  var wizPkgOk = spawnSync(pythonCmd, ["-c", "import pywizlight"], { encoding: "utf8" }).status === 0;

  if (!tinyOk || !wizPkgOk) {
    console.log(chalk.yellow("\n  Packages not found under '" + pythonCmd + "' — e.g. if you use conda or a venv."));
    var ansP = await inquirer.prompt([{
      type: "input", name: "customPython",
      message: "  Full path to Python with tinytuya + pywizlight (Enter to keep '" + pythonCmd + "'):",
      default: pythonCmd,
    }]);
    pythonCmd = ansP.customPython.trim() || pythonCmd;
  }

  var missingPkgs = [];
  ["tinytuya", "pywizlight"].forEach(function(pkg) {
    var r = spawnSync(pythonCmd, ["-c", "import " + pkg], { encoding: "utf8" });
    r.status === 0 ? ok(chalk, pkg) : (fail(chalk, pkg), missingPkgs.push(pkg));
  });
  if (missingPkgs.length) {
    console.log(chalk.red("\n  Run: " + DEFAULT_PIP + " install " + missingPkgs.join(" ")));
    console.log(chalk.gray("  Then re-run: npm run setup\n"));
    process.exit(1);
  }

  // ── Step 2: Discover Tuya bulbs ────────────────────────────────────────────
  printStep(chalk, 2, "Discover Tuya Bulbs");
  console.log(chalk.gray("  Scanning LAN via UDP broadcast (~10 seconds)...\n"));

  var tuyaDevices = scanTuya(pythonCmd);
  if (!tuyaDevices.length) {
    console.log(chalk.yellow("  No Tuya devices found automatically."));
    console.log(chalk.gray("  (Ensure bulbs are powered on, same subnet, firewall allows UDP)\n"));
  } else {
    tuyaDevices.forEach(function(d, i) {
      console.log(chalk.cyan("  " + (i+1) + ". IP: " + d.ip.padEnd(17) + " ID: " + d.gwId + "  v" + d.version));
    });
  }

  var ans2 = await inquirer.prompt([{
    type: "confirm", name: "addTuya",
    message: tuyaDevices.length ? "Add more Tuya devices manually?" : "Add Tuya devices manually?",
    default: tuyaDevices.length === 0,
  }]);

  if (ans2.addTuya) {
    var addingTuya = true;
    while (addingTuya) {
      var mt = await inquirer.prompt([
        { type: "input", name: "ip", message: "  Tuya device IP:", validate: function(v) { return v.trim() !== "" || "Required"; } },
        { type: "input", name: "gwId", message: "  Device ID:", validate: function(v) { return v.trim() !== "" || "Required"; } },
        { type: "list", name: "version", message: "  Firmware version:", choices: ["3.5", "3.4", "3.3", "3.1"], default: "3.5" },
      ]);
      tuyaDevices.push({ ip: mt.ip.trim(), gwId: mt.gwId.trim(), version: mt.version });
      var moreT = await inquirer.prompt([{ type: "confirm", name: "more", message: "  Add another Tuya device?", default: false }]);
      addingTuya = moreT.more;
    }
  }

  // ── Step 3: Discover WiZ bulbs ─────────────────────────────────────────────
  printStep(chalk, 3, "Discover WiZ Bulbs");

  var ans3 = await inquirer.prompt([{
    type: "confirm", name: "wantWiz",
    message: "Do you have Philips WiZ bulbs?",
    default: false,
  }]);

  var wizDevices = [];
  if (ans3.wantWiz) {
    var ans3b = await inquirer.prompt([{
      type: "input", name: "broadcast",
      message: "Broadcast address (check your router — usually 192.168.x.255):",
      default: "192.168.1.255",
    }]);
    console.log(chalk.gray("\n  Scanning " + ans3b.broadcast + " for WiZ bulbs (~8 seconds)...\n"));
    wizDevices = scanWiz(pythonCmd, ans3b.broadcast);

    if (!wizDevices.length) {
      console.log(chalk.yellow("  No WiZ bulbs found automatically."));
    } else {
      wizDevices.forEach(function(d, i) {
        console.log(chalk.cyan("  " + (i+1) + ". IP: " + d.ip.padEnd(17) + " MAC: " + (d.mac || "unknown")));
      });
    }

    var ans3c = await inquirer.prompt([{
      type: "confirm", name: "addWiz",
      message: wizDevices.length ? "Add more WiZ bulbs manually?" : "Add WiZ bulbs manually?",
      default: wizDevices.length === 0,
    }]);

    if (ans3c.addWiz) {
      var addingWiz = true;
      while (addingWiz) {
        var mw = await inquirer.prompt([
          { type: "input", name: "ip", message: "  WiZ bulb IP:", validate: function(v) { return v.trim() !== "" || "Required"; } },
          { type: "input", name: "mac", message: "  MAC address (optional, Enter to skip):" },
        ]);
        wizDevices.push({ ip: mw.ip.trim(), mac: (mw.mac || "").trim() });
        var moreW = await inquirer.prompt([{ type: "confirm", name: "more", message: "  Add another WiZ bulb?", default: false }]);
        addingWiz = moreW.more;
      }
    }
  }

  // ── Step 4: Name each bulb ─────────────────────────────────────────────────
  printStep(chalk, 4, "Name Your Bulbs");

  var allDevices = tuyaDevices.map(function(d) { return Object.assign({}, d, { protocol: "tuya" }); })
    .concat(wizDevices.map(function(d) { return Object.assign({}, d, { protocol: "wiz" }); }));

  if (!allDevices.length) {
    console.log(chalk.yellow("  No devices found — edit server/config.js manually after setup."));
  }

  var namedBulbs = [];
  for (var di = 0; di < allDevices.length; di++) {
    var dev = allDevices[di];
    var tag = dev.protocol === "wiz" ? chalk.blue("[WiZ] ") : chalk.green("[Tuya]");
    console.log("\n  " + tag + " " + chalk.bold(dev.ip));
    if (dev.protocol === "tuya") console.log(chalk.gray("         ID: " + dev.gwId));

    var ans4 = await inquirer.prompt([
      {
        type: "input", name: "id",
        message: "  Room ID (lowercase, no spaces):",
        validate: function(v) { return /^[a-z0-9_]+$/.test(v.trim()) || "Lowercase letters, numbers, underscores only"; },
        filter: function(v) { return v.trim(); },
      },
      {
        type: "input", name: "name",
        message: "  Display name:",
        default: function(a) { return a.id.replace(/_/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); }); },
        filter: function(v) { return v.trim(); },
      },
    ]);

    namedBulbs.push(Object.assign({}, dev, {
      id: ans4.id,
      name: ans4.name,
      icon: ROOM_ICONS[ans4.id] || "💡",
      localKey: "",
    }));
  }

  // ── Step 5: Tuya local keys ────────────────────────────────────────────────
  var tuyaNamed = namedBulbs.filter(function(b) { return b.protocol === "tuya"; });

  if (tuyaNamed.length > 0) {
    printStep(chalk, 5, "Tuya Local Keys");
    console.log(chalk.gray("  Tuya bulbs need a local encryption key to work on your LAN.\n"));

    var localKeys = {};

    if (fs.existsSync(DEVICES_JSON)) {
      localKeys = readLocalKeys(DEVICES_JSON);
      var matched = tuyaNamed.filter(function(b) { return localKeys[b.gwId]; }).length;
      console.log(chalk.green("  ✓ Found devices.json — matched " + matched + "/" + tuyaNamed.length + " key(s)"));
    }

    var stillMissing = tuyaNamed.filter(function(b) { return !localKeys[b.gwId]; });
    if (stillMissing.length > 0) {
      console.log(chalk.yellow("\n  Missing keys for: " + stillMissing.map(function(b) { return b.name; }).join(", ")));
      console.log(chalk.gray("\n  To fetch automatically from Tuya cloud:"));
      console.log(chalk.gray("    1. https://iot.tuya.com → create project → link your devices"));
      console.log(chalk.gray("    2. Run: " + pythonCmd + " -m tinytuya wizard\n"));

      var ans5a = await inquirer.prompt([{
        type: "confirm", name: "runWiz",
        message: "  Launch tinytuya wizard now? (needs iot.tuya.com credentials)",
        default: false,
      }]);

      if (ans5a.runWiz) {
        console.log(chalk.gray("\n  ─── tinytuya wizard ───────────────────────────"));
        await runInteractive(pythonCmd, ["-m", "tinytuya", "wizard"]);
        console.log(chalk.gray("  ────────────────────────────────────────────────\n"));
        if (fs.existsSync(DEVICES_JSON)) {
          localKeys = readLocalKeys(DEVICES_JSON);
          var matched2 = tuyaNamed.filter(function(b) { return localKeys[b.gwId]; }).length;
          console.log(chalk.green("  ✓ Loaded " + matched2 + " key(s) from devices.json"));
        }
      }

      // Manual entry for anything still missing
      for (var mi = 0; mi < tuyaNamed.length; mi++) {
        var mb = tuyaNamed[mi];
        if (localKeys[mb.gwId]) continue;
        var ans5b = await inquirer.prompt([{
          type: "input", name: "key",
          message: "  Local key for " + chalk.bold(mb.name) + " (" + mb.ip + ") — blank to skip:",
        }]);
        if (ans5b.key.trim()) localKeys[mb.gwId] = ans5b.key.trim();
      }
    }

    // Apply keys back into namedBulbs
    namedBulbs.forEach(function(b) {
      if (b.protocol === "tuya") b.localKey = localKeys[b.gwId] || "";
    });

    // Optional: flash keyed Tuya bulbs to verify
    var keyedTuya = tuyaNamed.filter(function(b) { return localKeys[b.gwId]; });
    if (keyedTuya.length > 0) {
      var ans5c = await inquirer.prompt([{
        type: "confirm", name: "doFlash",
        message: "  Flash bulbs red for 2s to confirm they respond?",
        default: false,
      }]);
      if (ans5c.doFlash) {
        for (var fi = 0; fi < keyedTuya.length; fi++) {
          var fb = keyedTuya[fi];
          process.stdout.write(chalk.gray("  Flashing " + fb.name + " (" + fb.ip + ")... "));
          flashBulbRed(pythonCmd, fb);
          console.log(chalk.green("done"));
        }
      }
    }
  } else {
    printStep(chalk, 5, "Tuya Local Keys");
    console.log(chalk.gray("  No Tuya bulbs configured — skipping."));
  }

  // ── Step 6: Spotify BPM sync ───────────────────────────────────────────────
  printStep(chalk, 6, "Spotify BPM Sync (Optional)");

  var existingEnv = parseEnvFile(ENV_PATH);
  var ans6a = await inquirer.prompt([{
    type: "confirm", name: "wantSpotify",
    message: "Enable Spotify BPM sync?",
    default: !!(existingEnv.SPOTIFY_CLIENT_ID),
  }]);

  var spotifyUpdates = {};
  if (ans6a.wantSpotify) {
    if (!existingEnv.SPOTIFY_CLIENT_ID) {
      console.log(chalk.gray("\n  1. https://developer.spotify.com/dashboard → Create an app"));
      console.log(chalk.gray("  2. Edit settings → Redirect URIs → add:"));
      console.log(chalk.cyan("        http://127.0.0.1:3001/spotify/callback\n"));
    }
    var ans6b = await inquirer.prompt([
      {
        type: "input", name: "clientId",
        message: "  Spotify Client ID:",
        default: existingEnv.SPOTIFY_CLIENT_ID || undefined,
        validate: function(v) { return v.trim().length > 0 || "Required"; },
        filter: function(v) { return v.trim(); },
      },
      {
        type: "password", name: "clientSecret",
        message: "  Spotify Client Secret:",
        mask: "*",
        default: existingEnv.SPOTIFY_CLIENT_SECRET || undefined,
        validate: function(v) { return v.trim().length > 0 || "Required"; },
        filter: function(v) { return v.trim(); },
      },
    ]);
    spotifyUpdates = {
      SPOTIFY_CLIENT_ID: ans6b.clientId,
      SPOTIFY_CLIENT_SECRET: ans6b.clientSecret,
    };
  }

  // ── Step 7: Write config ───────────────────────────────────────────────────
  printStep(chalk, 7, "Write Config");

  writeConfigJs(CONFIG_PATH, namedBulbs, chalk);
  writeEnvFile(ENV_PATH, spotifyUpdates, chalk);

  var tuyaForDaemon = namedBulbs.filter(function(b) { return b.protocol === "tuya" && b.localKey; });
  var wizForDaemon = namedBulbs.filter(function(b) { return b.protocol === "wiz"; });
  if (tuyaForDaemon.length || wizForDaemon.length) {
    updateDaemonConfig(tuyaForDaemon, wizForDaemon, chalk);
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.green("╔══════════════════════════════════════════╗"));
  console.log(chalk.bold.green("║") + chalk.bold("  ✓  Setup complete!                       ") + chalk.bold.green("║"));
  console.log(chalk.bold.green("╠══════════════════════════════════════════╣"));
  console.log(chalk.bold.green("║") + "  Start dev:   " + chalk.cyan("npm run dev") + "                 " + chalk.bold.green("║"));
  console.log(chalk.bold.green("║") + "  Production:  " + chalk.cyan("npm start") + "                   " + chalk.bold.green("║"));
  if (ans6a.wantSpotify) {
    console.log(chalk.bold.green("║") + "  Spotify:     " + chalk.gray("localhost:3001/spotify/login") + "  " + chalk.bold.green("║"));
  }
  console.log(chalk.bold.green("╚══════════════════════════════════════════╝"));
  console.log();
}

main().catch(function(e) {
  process.stderr.write("\n  Setup failed: " + e.message + "\n");
  if (process.env.DEBUG) process.stderr.write(e.stack + "\n");
  process.exit(1);
});
