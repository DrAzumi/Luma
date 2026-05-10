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
  const online = state.online ?? false;
  const mode = state.mode ?? "white";
  const color = state.color;

  // Orb color
  let orbColor;
  if (!power) {
    orbColor = "#1e1e26";
  } else if (mode === "colour" && color) {
    orbColor = `hsl(${color.h}, ${color.s / 10}%, ${20 + (color.v / 1000) * 50}%)`;
  } else {
    const warm = 30 + (colorTemp / 1000) * 30;
    const sat = 80 - (colorTemp / 1000) * 30;
    const light = 20 + (brightness / 1000) * 45;
    orbColor = `hsl(${warm}, ${sat}%, ${light}%)`;
  }

  const glowSize = power ? 40 + (brightness / 1000) * 60 : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        ...s.card,
        borderColor: power ? "#2e2e38" : "#222228",
        background: power
          ? `linear-gradient(135deg, #111113 60%, ${orbColor}18)`
          : "#111113",
      }}
    >
      {/* Header */}
      <div style={s.cardTop}>
        <div style={s.roomInfo}>
          <span style={s.icon}>{meta.icon}</span>
          <div>
            <div style={s.roomName}>{meta.label}</div>
            <div style={s.statusRow}>
              <span
                style={{ ...s.dot, background: online ? "#3ddc84" : "#ff4d6d" }}
              />
              <span style={s.statusText}>
                {online ? "online" : "offline"} · {id}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => onChange({ power: !power })}
          style={{ ...s.powerBtn, ...(power ? s.powerOn : {}) }}
        >
          ⏻
        </button>
      </div>

      {/* Orb */}
      <div style={s.orbWrap}>
        <motion.div
          animate={{
            width: power ? 72 + (brightness / 1000) * 32 : 40,
            height: power ? 72 + (brightness / 1000) * 32 : 40,
            background: orbColor,
            boxShadow: power ? `0 0 ${glowSize}px ${orbColor}88` : "none",
          }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          style={s.orb}
        />
      </div>

      {/* Controls */}
      <AnimatePresence>
        {power && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={s.controls}
          >
            {/* Brightness */}
            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>☀ Brightness</span>
              <span style={s.sliderValue}>{Math.round(brightness / 10)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={1000}
              value={brightness}
              style={s.slider}
              onChange={(e) => onChange({ brightness: Number(e.target.value) })}
            />

            {/* Color temp (only in white mode) */}
            {mode !== "colour" && (
              <>
                <div style={s.sliderRow}>
                  <span style={s.sliderLabel}>◑ Warmth</span>
                  <span style={s.sliderValue}>
                    {colorTemp < 400
                      ? "Warm"
                      : colorTemp < 700
                        ? "Neutral"
                        : "Cool"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={colorTemp}
                  style={{
                    ...s.slider,
                    background: "linear-gradient(to right, #ff9f43, #f8f8ff)",
                  }}
                  onChange={(e) =>
                    onChange({ colorTemp: Number(e.target.value) })
                  }
                />
              </>
            )}

            {/* Color mode toggle */}
            <button
              onClick={() => setShowColors((v) => !v)}
              style={s.colorToggle}
            >
              🎨 {showColors ? "Hide Colors" : "Color Mode"}
              {mode === "colour" && <span style={s.activePip} />}
            </button>

            {/* Color swatches */}
            <AnimatePresence>
              {showColors && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
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
                        border:
                          mode === "colour" &&
                          color &&
                          Math.abs(color.h - c.h) < 10
                            ? "2px solid white"
                            : "2px solid transparent",
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
          <span style={s.offText}>Off</span>
        </div>
      )}
    </motion.div>
  );
}

const s = {
  card: {
    borderRadius: 14,
    border: "1px solid",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minHeight: 240,
    transition: "border-color 0.3s, background 0.5s",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  roomInfo: { display: "flex", alignItems: "center", gap: 12 },
  icon: { fontSize: 28 },
  roomName: { fontSize: 15, fontWeight: 700, color: "#e8e8ee" },
  statusRow: { display: "flex", alignItems: "center", gap: 5, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: "50%" },
  statusText: {
    fontSize: 10,
    color: "#44445a",
    fontFamily: "'DM Mono',monospace",
  },
  powerBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "#18181c",
    border: "1px solid #2e2e38",
    color: "#8888a0",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
    cursor: "pointer",
  },
  powerOn: {
    background: "#f5c842",
    border: "1px solid #f5c842",
    color: "#0a0a0b",
  },
  orbWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: 80,
  },
  orb: { borderRadius: "50%" },
  controls: { display: "flex", flexDirection: "column", gap: 8 },
  sliderRow: { display: "flex", justifyContent: "space-between" },
  sliderLabel: {
    fontSize: 11,
    color: "#8888a0",
    fontFamily: "'DM Mono',monospace",
  },
  sliderValue: {
    fontSize: 11,
    color: "#44445a",
    fontFamily: "'DM Mono',monospace",
  },
  slider: {
    width: "100%",
    appearance: "none",
    height: 3,
    borderRadius: 2,
    background: "#2e2e38",
    cursor: "pointer",
  },
  colorToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 8,
    background: "#18181c",
    border: "1px solid #2e2e38",
    color: "#8888a0",
    fontSize: 11,
    fontFamily: "'DM Mono',monospace",
    cursor: "pointer",
    position: "relative",
  },
  activePip: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#f5c842",
    marginLeft: "auto",
  },
  swatchGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 6,
    overflow: "hidden",
  },
  swatch: {
    width: "100%",
    aspectRatio: "1",
    borderRadius: 6,
    cursor: "pointer",
    transition: "transform 0.1s",
    border: "2px solid transparent",
  },
  offState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  offText: {
    fontSize: 12,
    color: "#44445a",
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.1em",
  },
};
