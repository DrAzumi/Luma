require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const { start: startLanDaemon } = require("./lanDaemon");
const {
  initBulbs,
  setBulb,
  getState,
  getBulbs,
  pausePolling,
  resumePolling,
} = require("./bulbs");
const { runScene } = require("./scenes");
const { play, stop, getStatus, listSongs } = require("./cuePlayer");
const bpmEngine = require("./bpmEngine");
const spotify = require("./spotify");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

app.get("/api/state", (req, res) =>
  res.json({ bulbs: getBulbs(), state: getState() }),
);

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
  res.json({ running: bpmEngine.isRunning(), config: bpmEngine.getConfig() }),
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
  res.json({ connected: spotify.isAuthenticated() }),
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

io.on("connection", (socket) => {
  const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const ua = socket.handshake.headers["user-agent"] || "";
  const device = /iPhone|iPad/.test(ua) ? "📱 iPhone/iPad"
    : /Android/.test(ua) ? "📱 Android"
    : /Mobile/.test(ua) ? "📱 Mobile"
    : "🖥  Desktop";
  console.log(`[LUMA] ${device} connected  (${ip})`);
  socket.emit("bulbs:list", getBulbs());
  socket.emit("state:update", getState());
  socket.emit("song:status", getStatus());
  // Only send bpm:status if config is valid
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
  // Re-send BPM status to this socket (called on BpmEngine tab remount)
  socket.on("bpm:request-status", () => {
    socket.emit("bpm:status", { running: bpmEngine.isRunning(), config: bpmEngine.getConfig() });
  });
  // Re-send cached Spotify state to this socket (called on BpmEngine tab remount)
  socket.on("spotify:request-state", () => {
    socket.emit("spotify:status", { connected: spotify.isAuthenticated() });
    if (spotify.isAuthenticated()) {
      const { track, features } = spotify.getCachedState();
      if (track) socket.emit("spotify:nowplaying", track);
      if (features) socket.emit("spotify:features", features);
      else if (track) socket.emit("spotify:no-features", {});
    }
  });
  socket.on("disconnect", () => console.log(`[LUMA] ${device} disconnected (${ip})`));
});

const PORT = 3001;
server.listen(PORT, async () => {
  console.log(`\n🌕 LUMA server → http://localhost:${PORT}`);
  startLanDaemon();
  console.log("   Fetching bulb states from Tuya Cloud...\n");
  await initBulbs(io);
  console.log("\n   Open UI → http://localhost:5173\n");
  // Auto-reconnect Spotify from saved tokens
  bpmEngine.setPauseHooks(pausePolling, resumePolling);
  spotify.autoStart(io, bpmEngine);
});
