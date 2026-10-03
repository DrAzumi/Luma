require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const { start: startLanDaemon, reloadConfig, PYTHON } = require("./lanDaemon");
const {
  initBulbs,
  setBulb,
  getState,
  getBulbs,
  pausePolling,
  resumePolling,
  addBulbState,
  removeBulbState,
  isDemoMode,
  setDemoMode,
} = require("./bulbs");
const { runScene } = require("./scenes");
const { play, stop, getStatus, listSongs } = require("./cuePlayer");
const bpmEngine = require("./bpmEngine");
const spotify = require("./spotify");
const store = require("./config-store");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Serve built static client if production build exists
const clientBuildPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientBuildPath));

app.get("/api/state", (req, res) =>
  res.json({ bulbs: getBulbs(), state: getState(), demoMode: isDemoMode() })
);

app.get("/api/demo/status", (req, res) => {
  res.json({ demoMode: isDemoMode() });
});

app.post("/api/demo/toggle", (req, res) => {
  const enabled = req.body.enabled !== undefined ? req.body.enabled : !isDemoMode();
  const current = setDemoMode(enabled, io);
  res.json({ ok: true, demoMode: current });
});

app.get("/api/properties", (req, res) => {
  res.json({ properties: store.getProperties(), active: store.getActiveProperty() });
});

app.post("/api/properties/active", (req, res) => {
  try {
    const active = store.setActiveProperty(req.body.id);
    io.emit("properties:update", { properties: store.getProperties(), active });
    res.json({ ok: true, active });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/properties", (req, res) => {
  try {
    const prop = store.addProperty(req.body.name, req.body.icon);
    io.emit("properties:update", { properties: store.getProperties(), active: store.getActiveProperty() });
    res.json({ ok: true, property: prop });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/bulb/:id", async (req, res) => {
  try {
    await setBulb(req.params.id, req.body, io);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/scene/:name", async (req, res) => {
  try {
    bpmEngine.stop();
    await runScene(req.params.name, io);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/songs", (req, res) => res.json(listSongs()));
app.post("/api/song/play", (req, res) => {
  play(req.body.song, io, req.body.offset || 0);
  res.json({ ok: true });
});
app.post("/api/song/stop", (req, res) => {
  stop(io);
  res.json({ ok: true });
});
app.get("/api/song/status", (req, res) => res.json(getStatus()));

app.post("/api/bpm/start", (req, res) => {
  bpmEngine.start(req.body, io);
  res.json({ ok: true });
});
app.post("/api/bpm/update", (req, res) => {
  bpmEngine.update(req.body, io);
  res.json({ ok: true });
});
app.post("/api/bpm/stop", (req, res) => {
  bpmEngine.stop(io);
  res.json({ ok: true });
});
app.get("/api/bpm/status", (req, res) =>
  res.json({ running: bpmEngine.isRunning(), config: bpmEngine.getConfig() })
);

app.get("/spotify/login", (req, res) => res.redirect(spotify.getAuthUrl()));

app.get("/spotify/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`Spotify error: ${error}`);
  try {
    await spotify.exchangeCode(code);
    spotify.startPolling(io, bpmEngine);
    io.emit("spotify:connected", { ok: true });
    console.log("[Spotify] ✓ Authenticated");
    res.send(`<html><body style="font-family:monospace;background:#0a0a0b;color:#f5c842;padding:40px">
      <h2>🌕 LUMA — Spotify Connected</h2><p>You can close this tab.</p>
      <script>setTimeout(()=>window.close(),1500)</script></body></html>`);
  } catch (e) {
    res.status(500).send(`Auth failed: ${e.message}`);
  }
});

app.get("/spotify/status", (req, res) =>
  res.json({ connected: spotify.isAuthenticated() })
);

app.get("/spotify/debug-bpm", async (req, res) => {
  const { track, features } = spotify.getCachedState();
  if (!track) return res.json({ error: "No track cached — play something first" });
  const q = encodeURIComponent(`${track.name} ${track.artist.split(",")[0].trim()}`);
  let deezer = null;
  try {
    deezer = await fetch(`https://api.deezer.com/search?q=${q}&limit=5`).then((r) => r.json());
  } catch (e) {
    deezer = { error: e.message };
  }
  res.json({ track: { name: track.name, artist: track.artist, id: track.id }, cachedFeatures: features, deezerResults: deezer?.data?.map((t) => ({ title: t.title, artist: t.artist?.name, bpm: t.bpm, id: t.id })) });
});

app.post("/spotify/disconnect", (req, res) => {
  spotify.stopPolling();
  spotify.tokens.access_token = null;
  spotify.tokens.refresh_token = null;
  io.emit("spotify:disconnected", {});
  res.json({ ok: true });
});

// ── Discovery & Pairing API ──────────────────────────────────────────────────

const DISCOVER_SCRIPT = path.join(__dirname, "discover.py");

function runDiscovery(script, args) {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON, [script, args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.log(`[Discover] Failed (${code}): ${stderr.trim()}`);
        resolve([]);
      } else {
        try { resolve(JSON.parse(stdout.trim())); }
        catch { resolve([]); }
      }
    });
    proc.on("error", () => resolve([]));
  });
}

app.post("/api/scan/tuya", async (req, res) => {
  console.log("[Discover] Scanning for Tuya bulbs...");
  const devices = await runDiscovery(DISCOVER_SCRIPT, "scan-tuya");
  res.json({ devices });
});

app.post("/api/scan/wiz", async (req, res) => {
  console.log("[Discover] Scanning for WiZ bulbs...");
  const devices = await runDiscovery(DISCOVER_SCRIPT, "scan-wiz");
  res.json({ devices });
});

app.post("/api/bulbs/pair", async (req, res) => {
  try {
    const bulb = req.body;
    if (!bulb.id || !bulb.name || !bulb.protocol) {
      return res.status(400).json({ error: "Missing required fields: id, name, protocol" });
    }
    store.addBulb(bulb);
    addBulbState(bulb.id);
    reloadConfig();
    io.emit("bulbs:list", store.getBulbs());
    io.emit("state:update", getState());
    res.json({ ok: true, bulb });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/bulbs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = store.updateBulb(id, updates);
    reloadConfig();
    io.emit("bulbs:list", store.getBulbs());
    res.json({ ok: true, bulb: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/bulbs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    store.removeBulb(id);
    removeBulbState(id);
    reloadConfig();
    io.emit("bulbs:list", store.getBulbs());
    io.emit("state:update", getState());
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Groups API ────────────────────────────────────────────────────────────────

app.get("/api/groups", (req, res) => {
  res.json({ groups: store.getGroups() });
});

app.post("/api/groups", (req, res) => {
  try {
    const { name, bulbs } = req.body;
    if (!name) return res.status(400).json({ error: "Group must have a name" });
    const group = store.addGroup(name, bulbs || []);
    io.emit("groups:update", store.getGroups());
    res.json({ ok: true, group });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/groups/:id", (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const group = store.updateGroup(id, updates);
    io.emit("groups:update", store.getGroups());
    res.json({ ok: true, group });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/groups/:id", (req, res) => {
  try {
    const { id } = req.params;
    store.removeGroup(id);
    io.emit("groups:update", store.getGroups());
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/landing", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "public", "landing.html"));
});

// Fallback to index.html for SPA routing
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/spotify")) return next();
  const indexPath = path.join(clientBuildPath, "index.html");
  if (require("fs").existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send("API endpoint or SPA page not found");
});

io.on("connection", (socket) => {
  const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const ua = socket.handshake.headers["user-agent"] || "";
  const device = /iPhone|iPad/.test(ua) ? "📱 iPhone/iPad"
    : /Android/.test(ua) ? "📱 Android"
    : /Mobile/.test(ua) ? "📱 Mobile"
    : "🖥  Desktop";
  console.log(`[LUMA] ${device} connected (${ip})`);
  
  socket.emit("bulbs:list", getBulbs());
  socket.emit("state:update", getState());
  socket.emit("groups:update", store.getGroups());
  socket.emit("properties:update", { properties: store.getProperties(), active: store.getActiveProperty() });
  socket.emit("demo:status", { demoMode: isDemoMode() });
  socket.emit("song:status", getStatus());

  const bpmCfg = bpmEngine.getConfig();
  socket.emit("bpm:status", { running: bpmEngine.isRunning(), config: bpmCfg });
  socket.emit("spotify:status", { connected: spotify.isAuthenticated() });

  if (spotify.isAuthenticated()) {
    const { track, features } = spotify.getCachedState();
    if (track) socket.emit("spotify:nowplaying", track);
    if (features) socket.emit("spotify:features", features);
  }

  socket.on("bulb:set", async ({ id, params }) => {
    await setBulb(id, params, io);
  });
  socket.on("scene:run", async ({ name }) => {
    bpmEngine.stop();
    await runScene(name, io);
    io.emit("scene:active", { name });
  });
  socket.on("song:play", ({ song, offset }) => play(song, io, offset || 0));
  socket.on("song:stop", () => stop(io));
  socket.on("bpm:start", (cfg) => {
    if (cfg?.bpm) bpmEngine.start(cfg, io);
  });
  socket.on("bpm:update", (cfg) => {
    if (cfg?.bpm) bpmEngine.update(cfg, io);
  });
  socket.on("bpm:stop", () => bpmEngine.stop(io));
  socket.on("bpm:set-custom-palette", (palette) => {
    bpmEngine.setCustomPalette(palette, io);
  });
  socket.on("demo:toggle", ({ enabled }) => {
    setDemoMode(enabled, io);
  });
  socket.on("property:set", ({ id }) => {
    try {
      const active = store.setActiveProperty(id);
      io.emit("properties:update", { properties: store.getProperties(), active });
    } catch (e) {
      console.log(`[Property] Set failed: ${e.message}`);
    }
  });
  socket.on("bpm:request-status", () => {
    socket.emit("bpm:status", { running: bpmEngine.isRunning(), config: bpmEngine.getConfig() });
  });
  socket.on("spotify:request-state", () => {
    socket.emit("spotify:status", { connected: spotify.isAuthenticated() });
    if (spotify.isAuthenticated()) {
      const { track, features } = spotify.getCachedState();
      if (track) socket.emit("spotify:nowplaying", track);
      if (features) socket.emit("spotify:features", features);
    }
  });
  socket.on("disconnect", () => console.log(`[LUMA] ${device} disconnected (${ip})`));
});

const PORT = 3001;
server.listen(PORT, async () => {
  console.log(`\n🌕 LUMA server → http://localhost:${PORT}`);
  startLanDaemon();
  await initBulbs(io);
  bpmEngine.setPauseHooks(pausePolling, resumePolling);
  spotify.autoStart(io, bpmEngine);
});
