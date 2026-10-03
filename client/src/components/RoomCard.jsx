import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const COLORS = [
  { label: "White", h: 0, s: 0, v: 1000, hex: "#ffffff" },
  { label: "Warm", h: 30, s: 800, v: 1000, hex: "#ffaa33" },
  { label: "Red", h: 0, s: 1000, v: 1000, hex: "#ff3030" },
  { label: "Orange", h: 25, s: 1000, v: 1000, hex: "#ff7700" },
  { label: "Yellow", h: 55, s: 1000, v: 1000, hex: "#ffee00" },
  { label: "Green", h: 120, s: 1000, v: 1000, hex: "#00ee44" },
  { label: "Cyan", h: 180, s: 1000, v: 1000, hex: "#00eeff" },
  { label: "Blue", h: 220, s: 1000, v: 1000, hex: "#2255ff" },
  { label: "Purple", h: 270, s: 1000, v: 1000, hex: "#9933ff" },
  { label: "Pink", h: 320, s: 1000, v: 1000, hex: "#ff33aa" },
];

export default function RoomCard({ id, meta, state, onChange }) {
  const [showColors, setShowColors] = useState(false);

  const brightness = state.brightness ?? 500;
  const colorTemp = state.colorTemp ?? 500;
  const power = state.power ?? false;
  const online = state.online ?? true;
  const mode = state.mode ?? "white";
  const color = state.color;

  let orbColor;
  if (!power) {
    orbColor = "#181820";
  } else if (mode === "colour" && color) {
    orbColor = `hsl(${color.h}, ${color.s / 10}%, ${20 + (color.v / 1000) * 55}%)`;
  } else {
    const warm = 35 - (colorTemp / 1000) * 20;
    const sat = 90 - (colorTemp / 1000) * 40;
    const light = 25 + (brightness / 1000) * 50;
    orbColor = `hsl(${warm}, ${sat}%, ${light}%)`;
  }

  const glowSize = power ? 20 + (brightness / 1000) * 40 : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card"
      style={{
        ...s.card,
        borderColor: power ? "rgba(245, 200, 66, 0.25)" : "var(--border)",
        background: power
          ? `linear-gradient(135deg, rgba(18,18,24,0.9) 50%, ${orbColor}15)`
          : "rgba(18,18,24,0.7)",
      }}
    >
      {/* Header */}
      <div style={s.cardTop}>
        <div style={s.roomInfo}>
          <span style={s.icon}>{meta.icon || "💡"}</span>
          <div>
            <div style={s.roomName}>{meta.label}</div>
            <div style={s.statusRow}>
              <span
                style={{ ...s.dot, background: online ? "var(--online)" : "var(--offline)" }}
              />
              <span style={s.statusText} className="mono">
                {online ? "active" : "offline"} · {id}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => onChange({ power: !power })}
          style={{ ...s.powerBtn, ...(power ? s.powerOn : {}) }}
          className="btn-touch"
        >
          ⏻
        </button>
      </div>

      {/* Glowing Orb */}
      <div style={s.orbWrap}>
        <motion.div
          animate={{
            width: power ? 68 + (brightness / 1000) * 28 : 40,
            height: power ? 68 + (brightness / 1000) * 28 : 40,
            background: orbColor,
            boxShadow: power ? `0 0 ${glowSize}px ${orbColor}` : "none",
          }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          style={s.orb}
        />
      </div>

      {/* Controls */}
      <AnimatePresence>
        {power && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={s.controls}
          >
            {/* Brightness */}
            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>☀ Brightness</span>
              <span style={s.sliderValue} className="mono">{Math.round(brightness / 10)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={1000}
              value={brightness}
              onChange={(e) => onChange({ brightness: Number(e.target.value) })}
            />

            {/* Quick Brightness Presets */}
            <div style={s.presetRow}>
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  onClick={() => onChange({ brightness: pct * 10 })}
                  style={{
                    ...s.presetBtn,
                    borderColor: Math.round(brightness / 10) === pct ? 'var(--accent)' : 'var(--border2)',
                    color: Math.round(brightness / 10) === pct ? 'var(--accent)' : 'var(--text2)',
                  }}
                  className="mono"
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* Color temp */}
            {mode !== "colour" && (
              <>
                <div style={s.sliderRow}>
                  <span style={s.sliderLabel}>◑ Color Temp</span>
                  <span style={s.sliderValue} className="mono">
                    {colorTemp < 350 ? "Warm Amber" : colorTemp < 700 ? "Natural White" : "Cool Daylight"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={colorTemp}
                  style={{
                    background: "linear-gradient(to right, #ff9f43, #f8f8ff, #70a1ff)",
                  }}
                  onChange={(e) => onChange({ colorTemp: Number(e.target.value) })}
                />
              </>
            )}

            {/* Color mode toggle */}
            <button
              onClick={() => setShowColors((v) => !v)}
              style={s.colorToggle}
              className="btn-touch"
            >
              <span>🎨 {showColors ? "Hide Color Swatches" : "Color Palette"}</span>
              {mode === "colour" && <span style={s.activePip} />}
            </button>

            {/* Swatches */}
            <AnimatePresence>
              {showColors && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={s.swatchGrid}
                >
                  {COLORS.map((c) => (
                    <button
                      key={c.label}
                      title={c.label}
                      onClick={() => {
                        if (c.s === 0) {
                          onChange({ mode: "white", brightness, colorTemp });
                        } else {
                          onChange({ color: { h: c.h, s: c.s, v: c.v } });
                        }
                        setShowColors(false);
                      }}
                      style={{
                        ...s.swatch,
                        background: c.hex,
                        boxShadow: mode === "colour" && color && Math.abs(color.h - c.h) < 10 ? `0 0 12px ${c.hex}` : "none",
                        border: mode === "colour" && color && Math.abs(color.h - c.h) < 10 ? "2px solid #ffffff" : "2px solid transparent",
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {!power && (
        <div style={s.offState}>
          <span style={s.offText} className="mono">STANDBY</span>
        </div>
      )}
    </motion.div>
  );
}

const s = {
  card: {
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minHeight: 240,
    position: "relative",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  roomInfo: { display: "flex", alignItems: "center", gap: 12 },
  icon: { fontSize: 28 },
  roomName: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  statusRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: "50%" },
  statusText: {
    fontSize: 10,
    color: "var(--text2)",
    letterSpacing: "0.05em",
  },
  powerBtn: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    color: "var(--text2)",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
  },
  powerOn: {
    background: "var(--gradient-gold)",
    border: "1px solid var(--accent)",
    color: "#0a0a0b",
    boxShadow: "var(--glow-gold)",
  },
  orbWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 90,
  },
  orb: { borderRadius: "50%" },
  controls: { display: "flex", flexDirection: "column", gap: 10 },
  sliderRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sliderLabel: {
    fontSize: 11,
    color: "var(--text2)",
    fontWeight: 600,
  },
  sliderValue: {
    fontSize: 11,
    color: "var(--accent)",
    fontWeight: 600,
  },
  presetRow: { display: "flex", gap: 6, marginTop: -2 },
  presetBtn: {
    flex: 1,
    padding: "4px 0",
    borderRadius: "var(--radius-xs)",
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    fontSize: 10,
    cursor: "pointer",
  },
  colorToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    color: "var(--text)",
    fontSize: 12,
    marginTop: 4,
  },
  activePip: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "var(--accent)",
  },
  swatchGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 8,
    marginTop: 4,
  },
  swatch: {
    width: "100%",
    aspectRatio: "1",
    borderRadius: "var(--radius-xs)",
    cursor: "pointer",
    transition: "transform 0.15s ease",
  },
  offState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
  },
  offText: {
    fontSize: 11,
    color: "var(--text3)",
    letterSpacing: "0.15em",
  },
};
