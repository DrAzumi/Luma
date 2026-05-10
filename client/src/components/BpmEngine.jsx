import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import socket from "../socket";

const PRESETS = [
  {
    name: "Beto's Horns",
    bpm: 129,
    palette: "betos",
    pattern: "counterpoint",
    effect: "thumper",
    icon: "🎺",
  },
  {
    name: "Techno",
    bpm: 140,
    palette: "cool",
    pattern: "unison",
    effect: "pulse",
    icon: "⚡",
  },
  {
    name: "House",
    bpm: 124,
    palette: "warm",
    pattern: "counterpoint",
    effect: "breathe",
    icon: "🏠",
  },
  {
    name: "Drum & Bass",
    bpm: 174,
    palette: "neon",
    pattern: "chase",
    effect: "strobe",
    icon: "🥁",
  },
  {
    name: "Ambient",
    bpm: 72,
    palette: "mono",
    pattern: "split",
    effect: "breathe",
    icon: "🌊",
  },
  {
    name: "Fire",
    bpm: 100,
    palette: "fire",
    pattern: "split",
    effect: "ripple",
    icon: "🔥",
  },
];

const PALETTE_GROUPS = {
  Standard: ["betos", "warm", "cool", "neon", "mono", "fire"],
  Albums: ["currents", "lonerism", "slowrush", "actuallife", "igor", "blonde"],
};

const PALETTE_META = {
  betos: {
    label: "Luma Default",
    colors: ["#4488ff", "#ff8800", "#ff2200", "#aa44ff"],
  },
  warm: { label: "Warm", colors: ["#ff2200", "#ff6600", "#ffaa00", "#ff4400"] },
  cool: { label: "Cool", colors: ["#00aaff", "#2244ff", "#4400ff", "#00ccff"] },
  neon: { label: "Neon", colors: ["#ff00ff", "#00ff44", "#ffff00", "#ff0000"] },
  mono: {
    label: "Mono Blue",
    colors: ["#4466ff", "#2244cc", "#6688ff", "#2255ff"],
  },
  fire: { label: "Fire", colors: ["#ff0000", "#ff3300", "#ff6600", "#ff1100"] },
  currents: {
    label: "Tame Impala — Currents",
    colors: ["#e8516a", "#1a9b8a", "#e07833", "#7b4fa8"],
  },
  lonerism: {
    label: "Tame Impala — Lonerism",
    colors: ["#5b8db8", "#6b9e6b", "#c8b86a", "#c48a9e"],
  },
  slowrush: {
    label: "The Slow Rush",
    colors: ["#e8941a", "#c45a28", "#4a8cb8", "#c8a855"],
  },
  actuallife: {
    label: "Fred again — Actual Life",
    colors: ["#1a6aff", "#ffffff", "#1a4aee", "#4466dd"],
  },
  igor: {
    label: "Tyler — IGOR",
    colors: ["#e8c01a", "#e87020", "#6a3ab0", "#e03060"],
  },
  blonde: {
    label: "Frank Ocean — Blonde",
    colors: ["#d4b86a", "#c8a040", "#8ab0c8", "#e0d0a8"],
  },
};

const PATTERNS = ["counterpoint", "unison", "chase", "split"];
const PATTERN_DESC = {
  counterpoint: "WM vs Bedroom/Hall — opposite motion",
  unison: "All three move together",
  chase: "Colour rotates Bedroom→Hall→WM",
  split: "Two groups alternate",
};

const EFFECTS = [
  { id: "thumper", label: "Thumper", desc: "Every 4th beat hits hard" },
  { id: "pulse", label: "Pulse", desc: "WM punches, others counter" },
  { id: "breathe", label: "Breathe", desc: "Sine-wave offset per bulb" },
  { id: "strobe", label: "Strobe", desc: "Hard alternating flash" },
  { id: "chase", label: "Chase", desc: "Brightness sweeps across" },
  { id: "ripple", label: "Ripple", desc: "Wave rolls across 3 bulbs" },
];

export default function BpmEngine() {
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(0);
  const [bpm, setBpm] = useState(129);
  const [bpmInput, setBpmInput] = useState("129");
  const [editingBpm, setEditingBpm] = useState(false);
  const [palette, setPalette] = useState("betos");
  const [pattern, setPattern] = useState("counterpoint");
  const [effect, setEffect] = useState("thumper");
  const [intensity, setIntensity] = useState(0.8);
  const [colorShift, setColorShift] = useState(false);
  const [tapTimes, setTapTimes] = useState([]);
  const [spotify, setSpotify] = useState({
    connected: false,
    track: null,
    features: null,
  });
  const [albumColors, setAlbumColors] = useState(null);
  const [customPaletteLoaded, setCustomPaletteLoaded] = useState(false);
  const [spotifySync, setSpotifySync] = useState(false);
  const pulseRef = useRef(null);
  const bpmInputRef = useRef(null);

  useEffect(() => {
    // Request current state immediately — handles tab-switch remount
    socket.emit("spotify:request-state");
    socket.emit("bpm:request-status");

    socket.on("bpm:status", ({ running: r, config: c }) => {
      setRunning(r);
      if (c?.bpm) {
        setBpm(c.bpm);
        setBpmInput(String(c.bpm));
        setPalette(c.palette);
        setPattern(c.pattern);
        setEffect(c.effect || "thumper");
      }
      if (c?.spotifySync) { setSpotifySync(true); setCustomPaletteLoaded(true); }
    });
    socket.on("bpm:started", ({ config: c }) => {
      setRunning(true);
      if (c?.bpm) { setBpm(c.bpm); setBpmInput(String(c.bpm)); }
      if (c?.spotifySync) { setSpotifySync(true); setCustomPaletteLoaded(true); }
    });
    socket.on("bpm:custom-palette-set", () => setCustomPaletteLoaded(true));
    socket.on("bpm:updated", (cfg) => {
      if (cfg?.bpm) { setBpm(cfg.bpm); setBpmInput(String(cfg.bpm)); }
      if (cfg?.palette) setPalette(cfg.palette);
    });
    socket.on("bpm:stopped", () => {
      setRunning(false);
      setBeat(0);
    });
    socket.on("bpm:beat", ({ beat: b }) => {
      setBeat(b);
      if (pulseRef.current) {
        pulseRef.current.style.transform = "scale(1.6)";
        pulseRef.current.style.opacity = "1";
        setTimeout(() => {
          if (pulseRef.current) {
            pulseRef.current.style.transform = "scale(1)";
            pulseRef.current.style.opacity = "0.2";
          }
        }, 80);
      }
    });
    socket.on("spotify:connected", () =>
      setSpotify((s) => ({ ...s, connected: true })),
    );
    socket.on("spotify:disconnected", () => {
      setSpotify({ connected: false, track: null, features: null });
      setSpotifySync(false);
    });
    socket.on("spotify:status", ({ connected }) =>
      setSpotify((s) => ({ ...s, connected })),
    );
    socket.on("spotify:nowplaying", (track) => {
      setSpotify((s) => ({ ...s, track }));
      if (track.albumArt) extractColors(track.albumArt, track.album);
    });
    socket.on("spotify:features", (features) => {
      setSpotify((s) => ({ ...s, features }));
      if (features.bpm) { setBpm(features.bpm); setBpmInput(String(features.bpm)); }
    });
    socket.on("spotify:no-features", () => setSpotify((s) => ({ ...s, features: null })));
    return () => socket.removeAllListeners();
  }, []);

  // Extract dominant colours from album art using canvas
  const extractColors = useCallback((imageUrl, albumName) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 50, 50);
      const data = ctx.getImageData(0, 0, 50, 50).data;

      // Sample 4 quadrants for dominant colour per region
      const regions = [
        { x: 0, y: 0 },
        { x: 25, y: 0 },
        { x: 0, y: 25 },
        { x: 25, y: 25 },
      ];

      const colors = regions.map(({ x, y }) => {
        let r = 0,
          g = 0,
          b = 0,
          count = 0;
        for (let px = x; px < x + 25; px++) {
          for (let py = y; py < y + 25; py++) {
            const i = (py * 50 + px) * 4;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        return `rgb(${r},${g},${b})`;
      });

      setAlbumColors({ colors, albumName, imageUrl });
    };
    img.onerror = () => {};
    img.src = imageUrl;
  }, []);

  // When in Spotify sync mode and a new track's album colors arrive, auto-apply them
  useEffect(() => {
    if (!spotifySync || !albumColors) return;
    const pal = albumColors.colors.map(rgbToHsv);
    socket.emit("bpm:set-custom-palette", pal);
    setPalette("custom");
    setCustomPaletteLoaded(true);
  }, [albumColors, spotifySync]);

  const getConfig = () => ({
    bpm,
    palette,
    pattern,
    effect,
    intensity,
    colorShift,
  });

  const emitUpdate = (key, val) => {
    const cfg = { ...getConfig(), [key]: val };
    if (running) socket.emit("bpm:update", cfg);
  };

  const startStop = () => {
    if (running) socket.emit("bpm:stop");
    else socket.emit("bpm:start", getConfig());
  };

  const applyPreset = (p) => {
    setSpotifySync(false);
    setBpm(p.bpm);
    setBpmInput(String(p.bpm));
    setPalette(p.palette);
    setPattern(p.pattern);
    setEffect(p.effect);
    const cfg = {
      bpm: p.bpm,
      palette: p.palette,
      pattern: p.pattern,
      effect: p.effect,
      intensity,
      colorShift,
    };
    if (running) socket.emit("bpm:update", cfg);
  };

  const tap = () => {
    const now = Date.now();
    const recent = [...tapTimes, now].filter((t) => now - t < 4000).slice(-8);
    setTapTimes(recent);
    if (recent.length >= 2) {
      const intervals = recent.slice(1).map((t, i) => t - recent[i]);
      const avg = intervals.reduce((a, b) => a + b) / intervals.length;
      const newBpm = Math.max(40, Math.min(240, Math.round(60000 / avg)));
      setBpm(newBpm);
      setBpmInput(String(newBpm));
      emitUpdate("bpm", newBpm);
    }
  };

  const commitBpmInput = () => {
    const v = parseInt(bpmInput);
    if (!isNaN(v) && v >= 40 && v <= 240) {
      setBpm(v);
      emitUpdate("bpm", v);
    } else {
      setBpmInput(String(bpm)); // revert
    }
    setEditingBpm(false);
  };

  const rgbToHsv = (str) => {
    const m = str.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return { h: 0, s: 0 };
    let r = parseInt(m[1]) / 255, g = parseInt(m[2]) / 255, b = parseInt(m[3]) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round((max === 0 ? 0 : d / max) * 1000) };
  };

  const openSpotify = () =>
    window.open(
      "http://localhost:3001/spotify/login",
      "_blank",
      "width=500,height=700",
    );

  const colors = PALETTE_META[palette]?.colors || PALETTE_META.betos.colors;
  const beatMs = Math.round((60 / bpm) * 1000);

  return (
    <div style={s.wrap}>
      {/* Header + pulse */}
      <div style={s.header}>
        <div>
          <div style={s.title}>BPM Sync</div>
          <div style={s.sub}>Lights pulse in time with your music</div>
        </div>
        <div style={s.pulseWrap}>
          <div
            ref={pulseRef}
            style={{
              ...s.pulse,
              background: colors[beat % 4] || "#f5c842",
              opacity: running ? 0.2 : 0.08,
              transition: "transform 0.08s,opacity 0.08s",
            }}
          />
          {running && (
            <div
              style={{ ...s.ring, borderColor: colors[beat % 4] || "#f5c842" }}
            />
          )}
        </div>
      </div>

      {/* Spotify panel */}
      <div style={{ ...s.spotifyPanel, borderColor: spotifySync ? "#1db954" : spotify.connected ? "#1db95460" : "var(--border)" }}>

        {/* Header row */}
        <div style={s.spotifyTop}>
          <div style={s.spotifyLogo}>
            <span style={{ fontSize: 16 }}>♫</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: spotify.connected ? "#1db954" : "var(--text2)" }}>
              {spotify.connected ? "Spotify" : "Spotify"}
            </span>
            {spotifySync && (
              <span style={{ fontSize: 10, background: "#1db95420", color: "#1db954", border: "1px solid #1db95440", borderRadius: 4, padding: "2px 6px", fontFamily: "'DM Mono',monospace" }}>
                AUTO-SYNC ON
              </span>
            )}
          </div>
          {!spotify.connected ? (
            <button onClick={openSpotify} style={s.spotifyBtn}>Connect</button>
          ) : (
            <button
              onClick={() => fetch("http://localhost:3001/spotify/disconnect", { method: "POST" })
                .then(() => { setSpotify({ connected: false, track: null, features: null }); setSpotifySync(false); })}
              style={{ ...s.spotifyBtn, background: "#ff4d6d20", color: "#ff4d6d", borderColor: "#ff4d6d" }}
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Now playing */}
        {spotify.connected && spotify.track && (
          <motion.div key={spotify.track.name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {spotify.track.albumArtSm && (
              <img src={spotify.track.albumArtSm} alt="album" style={{ ...s.albumThumb, width: 56, height: 56, borderRadius: 8, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...s.trackName, fontSize: 14 }}>{spotify.track.name}</div>
              <div style={{ ...s.trackArtist, marginTop: 2 }}>{spotify.track.artist}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                {spotify.features?.bpm ? (
                  <span style={{ ...s.featBadge, background: "#1db95420", color: "#1db954", border: "1px solid #1db95440", fontWeight: 700, fontSize: 11 }}>
                    ♩ {spotify.features.bpm} BPM
                  </span>
                ) : (
                  <span style={{ ...s.featBadge, color: "var(--text3)" }}>BPM detecting…</span>
                )}
                {spotify.features?.energy != null && (
                  <span style={s.featBadge}>Energy {Math.round(spotify.features.energy * 100)}%</span>
                )}
                {spotify.features?.mode != null && (
                  <span style={s.featBadge}>{spotify.features.mode === 1 ? "Major" : "Minor"}</span>
                )}
                {albumColors && (
                  <div style={{ display: "flex", gap: 3, marginLeft: 2 }}>
                    {albumColors.colors.map((c, i) => (
                      <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c, border: "1px solid #ffffff18" }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {spotify.connected && !spotify.track && (
          <div style={s.noTrack}>Play something in Spotify to sync</div>
        )}

        {/* Sync to Spotify — main CTA */}
        {spotify.connected && spotify.track && (
          <button
            onClick={() => {
              if (spotifySync) {
                // Toggle off
                setSpotifySync(false);
                socket.emit("bpm:stop");
                return;
              }
              // Toggle on — start engine with current track's BPM + album colors
              const newBpm = spotify.features?.bpm || bpm;
              setBpm(newBpm);
              setBpmInput(String(newBpm));
              setSpotifySync(true);

              let newPalette = palette;
              if (albumColors) {
                const pal = albumColors.colors.map(rgbToHsv);
                socket.emit("bpm:set-custom-palette", pal);
                setPalette("custom");
                setCustomPaletteLoaded(true);
                newPalette = "custom";
              }
              const cfg = { ...getConfig(), bpm: newBpm, palette: newPalette };
              if (running) socket.emit("bpm:update", cfg);
              else socket.emit("bpm:start", cfg);
            }}
            style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.04em",
              cursor: "pointer",
              transition: "all 0.2s",
              fontFamily: "'DM Mono',monospace",
              background: spotifySync ? "#1db95420" : "#1db954",
              color: spotifySync ? "#1db954" : "#0a0a0b",
              border: spotifySync ? "1px solid #1db954" : "none",
            }}
          >
            {spotifySync
              ? `■ Stop Sync · ${spotify.features?.bpm ?? bpm} BPM`
              : spotify.features?.bpm
              ? `▶ Sync to Spotify · ${spotify.features.bpm} BPM`
              : `▶ Sync to Spotify · ${bpm} BPM`}
          </button>
        )}

        {spotifySync && (
          <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "'DM Mono',monospace", textAlign: "center" }}>
            BPM + album colors auto-follow each song
          </div>
        )}
      </div>

      {/* Presets */}
      <div style={s.section}>
        <div style={s.label}>PRESETS</div>
        <div style={s.presetGrid}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              style={{
                ...s.presetBtn,
                borderColor:
                  bpm === p.bpm && palette === p.palette
                    ? "var(--accent)"
                    : "var(--border)",
                background:
                  bpm === p.bpm && palette === p.palette
                    ? "#f5c84212"
                    : "var(--surface)",
              }}
            >
              <span style={{ fontSize: 18 }}>{p.icon}</span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text2)",
                  fontFamily: "'DM Mono',monospace",
                  textAlign: "center",
                }}
              >
                {p.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  fontFamily: "'DM Mono',monospace",
                  fontWeight: 700,
                }}
              >
                {p.bpm}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* BPM — editable number + tap + slider */}
      <div style={s.section}>
        <div style={s.label}>TEMPO</div>
        <div style={s.bpmRow}>
          <div style={s.bpmDisplay}>
            {editingBpm ? (
              <input
                ref={bpmInputRef}
                value={bpmInput}
                onChange={(e) => setBpmInput(e.target.value)}
                onBlur={commitBpmInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBpmInput();
                  if (e.key === "Escape") {
                    setBpmInput(String(bpm));
                    setEditingBpm(false);
                  }
                }}
                style={s.bpmEditInput}
                autoFocus
              />
            ) : (
              <span
                style={s.bpmNum}
                onClick={() => {
                  setEditingBpm(true);
                  setTimeout(() => bpmInputRef.current?.select(), 50);
                }}
                title="Click to edit"
              >
                {bpm}
              </span>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={s.bpmUnit}>BPM</span>
              <span style={s.bpmMs}>{beatMs}ms</span>
            </div>
          </div>
          <button onClick={tap} style={s.tapBtn}>
            TAP
          </button>
        </div>
        <input
          type="range"
          min={40}
          max={240}
          value={bpm}
          style={s.slider}
          onChange={(e) => {
            const v = Number(e.target.value);
            setBpm(v);
            setBpmInput(String(v));
            emitUpdate("bpm", v);
          }}
        />
        <div style={s.rangeRow}>
          <span style={s.rangeTxt}>40 slow</span>
          <span style={s.rangeTxt}>
            half-tempo tip: {Math.round(bpm / 2)} BPM
          </span>
          <span style={s.rangeTxt}>240 fast</span>
        </div>
      </div>

      {/* Effects */}
      <div style={s.section}>
        <div style={s.label}>BRIGHTNESS EFFECT</div>
        <div style={s.effectGrid}>
          {EFFECTS.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                setEffect(e.id);
                emitUpdate("effect", e.id);
              }}
              style={{
                ...s.effectBtn,
                borderColor:
                  effect === e.id ? "var(--accent)" : "var(--border)",
                background: effect === e.id ? "#f5c84212" : "var(--surface)",
                color: effect === e.id ? "var(--accent)" : "var(--text2)",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'DM Mono',monospace",
                }}
              >
                {e.label}
              </span>
              <span
                style={{ fontSize: 10, color: "var(--text3)", lineHeight: 1.4 }}
              >
                {e.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Palette — grouped */}
      <div style={s.section}>
        <div style={s.label}>COLOUR PALETTE</div>
        {customPaletteLoaded && (
          <div style={{ marginBottom: 10 }}>
            <div style={s.groupLabel}>From Spotify</div>
            <div style={s.palGrid}>
              <button
                onClick={() => { setPalette("custom"); emitUpdate("palette", "custom"); }}
                style={{
                  ...s.palBtn,
                  borderColor: palette === "custom" ? "var(--accent)" : "var(--border)",
                  background: palette === "custom" ? "#f5c84212" : "var(--surface)",
                }}
              >
                <div style={s.swatchRow}>
                  {albumColors?.colors.map((c, i) => (
                    <div key={i} style={{ ...s.swatch, background: c }} />
                  ))}
                </div>
                <span style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", color: palette === "custom" ? "var(--accent)" : "var(--text3)", textAlign: "center" }}>
                  Album Art
                </span>
              </button>
            </div>
          </div>
        )}
        {Object.entries(PALETTE_GROUPS).map(([group, ids]) => (
          <div key={group} style={{ marginBottom: 10 }}>
            <div style={s.groupLabel}>{group}</div>
            <div style={s.palGrid}>
              {ids.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setSpotifySync(false);
                    setPalette(p);
                    emitUpdate("palette", p);
                  }}
                  style={{
                    ...s.palBtn,
                    borderColor:
                      palette === p ? "var(--accent)" : "var(--border)",
                    background: palette === p ? "#f5c84212" : "var(--surface)",
                  }}
                >
                  <div style={s.swatchRow}>
                    {PALETTE_META[p].colors.map((c, i) => (
                      <div key={i} style={{ ...s.swatch, background: c }} />
                    ))}
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "'DM Mono',monospace",
                      color: palette === p ? "var(--accent)" : "var(--text3)",
                      lineHeight: 1.3,
                      textAlign: "center",
                    }}
                  >
                    {PALETTE_META[p].label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pattern */}
      <div style={s.section}>
        <div style={s.label}>COLOUR PATTERN</div>
        <div style={s.patternGrid}>
          {PATTERNS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setPattern(p);
                emitUpdate("pattern", p);
              }}
              style={{
                ...s.patternBtn,
                borderColor: pattern === p ? "var(--accent)" : "var(--border)",
                color: pattern === p ? "var(--accent)" : "var(--text2)",
                background: pattern === p ? "#f5c84212" : "var(--surface)",
              }}
            >
              <span style={{ fontWeight: 700 }}>{p}</span>
              <span
                style={{ fontSize: 9, color: "var(--text3)", marginTop: 2 }}
              >
                {PATTERN_DESC[p]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Intensity + hue shift */}
      <div style={s.section}>
        <div style={s.label}>INTENSITY · {Math.round(intensity * 100)}%</div>
        <div style={s.sliderRow}>
          <span style={s.rangeTxt}>Low</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={intensity}
            style={{ ...s.slider, flex: 1 }}
            onChange={(e) => {
              const v = Number(e.target.value);
              setIntensity(v);
              emitUpdate("intensity", v);
            }}
          />
          <span style={s.rangeTxt}>High</span>
        </div>
        <button
          onClick={() => {
            const v = !colorShift;
            setColorShift(v);
            emitUpdate("colorShift", v);
          }}
          style={{
            ...s.shiftBtn,
            borderColor: colorShift ? "var(--accent)" : "var(--border)",
            color: colorShift ? "var(--accent)" : "var(--text2)",
          }}
        >
          🌈 Hue Shift {colorShift ? "ON" : "OFF"}
          <span
            style={{ fontSize: 10, color: "var(--text3)", marginLeft: "auto" }}
          >
            rotates +6° per beat
          </span>
        </button>
      </div>

      {/* Start/stop */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={startStop}
        style={{
          ...s.mainBtn,
          background: running ? "#ff4d6d18" : "var(--accent)",
          color: running ? "#ff4d6d" : "#0a0a0b",
          border: running ? "1px solid #ff4d6d" : "none",
        }}
      >
        {running ? `■ Stop · beat ${beat}` : `▶ Start at ${bpm} BPM`}
      </motion.button>

      {running && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={s.liveInfo}
        >
          {effect} · {palette} · {pattern} · {Math.round(intensity * 100)}%
          intensity
        </motion.div>
      )}
    </div>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 22 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: { fontSize: 18, fontWeight: 800 },
  sub: {
    fontSize: 12,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    marginTop: 3,
  },
  pulseWrap: {
    position: "relative",
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: { width: 26, height: 26, borderRadius: "50%" },
  ring: {
    position: "absolute",
    inset: -6,
    borderRadius: "50%",
    border: "1px solid",
    opacity: 0.35,
  },
  spotifyPanel: {
    border: "1px solid",
    borderRadius: "var(--radius)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "var(--surface)",
    transition: "border-color 0.3s",
  },
  spotifyTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  spotifyLogo: { display: "flex", alignItems: "center", gap: 8 },
  spotifyBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    background: "#1db95420",
    color: "#1db954",
    border: "1px solid #1db954",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
  },
  nowPlaying: { display: "flex", alignItems: "center", gap: 12 },
  albumThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    objectFit: "cover",
    flexShrink: 0,
  },
  trackInfo: { flex: 1 },
  trackName: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  trackArtist: {
    fontSize: 11,
    color: "var(--text2)",
    fontFamily: "'DM Mono',monospace",
    marginTop: 2,
  },
  trackFeatures: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" },
  featBadge: {
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 4,
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
  },
  syncBpmBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    background: "var(--accent)",
    color: "#0a0a0b",
    border: "none",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  noTrack: {
    fontSize: 11,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
  },
  albumColors: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  albumColorLabel: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
  },
  albumSwatches: { display: "flex", gap: 4 },
  albumSwatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: "1px solid var(--border2)",
  },
  albumColorNote: {
    fontSize: 9,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
  },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  label: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.12em",
  },
  groupLabel: {
    fontSize: 9,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.08em",
    marginBottom: 6,
  },
  presetGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 },
  presetBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "10px 6px",
    borderRadius: 10,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.15s",
    background: "var(--surface)",
  },
  bpmRow: { display: "flex", alignItems: "center", gap: 16 },
  bpmDisplay: { flex: 1, display: "flex", alignItems: "center", gap: 10 },
  bpmNum: {
    fontSize: 52,
    fontWeight: 800,
    color: "var(--accent)",
    lineHeight: 1,
    fontFamily: "'DM Mono',monospace",
    cursor: "text",
    borderBottom: "1px dashed var(--border2)",
  },
  bpmEditInput: {
    fontSize: 52,
    fontWeight: 800,
    color: "var(--accent)",
    fontFamily: "'DM Mono',monospace",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid var(--accent)",
    outline: "none",
    width: 120,
  },
  bpmUnit: {
    fontSize: 14,
    color: "var(--text2)",
    fontFamily: "'DM Mono',monospace",
  },
  bpmMs: {
    fontSize: 11,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
  },
  tapBtn: {
    padding: "12px 22px",
    borderRadius: 10,
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.1em",
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
    userSelect: "none",
  },
  slider: {
    width: "100%",
    appearance: "none",
    height: 3,
    borderRadius: 2,
    background: "var(--border2)",
    cursor: "pointer",
  },
  rangeRow: { display: "flex", justifyContent: "space-between" },
  rangeTxt: {
    fontSize: 9,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
  },
  effectGrid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 },
  effectBtn: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s",
  },
  palGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 },
  palBtn: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    padding: "8px 8px",
    borderRadius: 10,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.15s",
    alignItems: "center",
  },
  swatchRow: { display: "flex", gap: 2, width: "100%" },
  swatch: { flex: 1, height: 7, borderRadius: 2 },
  patternGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2,1fr)",
    gap: 8,
  },
  patternBtn: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 11,
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.04em",
    cursor: "pointer",
    transition: "all 0.15s",
    textAlign: "left",
  },
  sliderRow: { display: "flex", alignItems: "center", gap: 10 },
  shiftBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid",
    background: "var(--surface)",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "'DM Mono',monospace",
    transition: "all 0.15s",
  },
  mainBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  liveInfo: {
    textAlign: "center",
    fontSize: 11,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
  },
};
