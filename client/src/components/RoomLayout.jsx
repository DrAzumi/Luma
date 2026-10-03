import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import socket from "../socket";

// ── Group colors ──────────────────────────────────────────────────────────────
const GROUP_COLORS = [
  { bg: "#f5c84220", border: "#f5c842", label: "gold" },
  { bg: "#4488ff20", border: "#4488ff", label: "blue" },
  { bg: "#22cc8820", border: "#22cc88", label: "green" },
  { bg: "#aa44ff20", border: "#aa44ff", label: "purple" },
  { bg: "#ff44aa20", border: "#ff44aa", label: "pink" },
  { bg: "#ff882020", border: "#ff8820", label: "orange" },
];

// ── Default auto-layout ───────────────────────────────────────────────────────
function calcAutoPositions(bulbs) {
  const cols = Math.ceil(Math.sqrt(bulbs.length));
  const rows = Math.ceil(bulbs.length / cols);
  return bulbs.reduce((acc, b, i) => {
    acc[b.id] = { x: ((i % cols) + 0.5) / cols * 100, y: (Math.floor(i / cols) + 0.5) / rows * 100 };
    return acc;
  }, {});
}

// ── Bulb glow color from state ────────────────────────────────────────────────
function getGlowColor(stateData) {
  if (!stateData?.power) return "#1a1a22";
  if (stateData.mode === "colour" && stateData.color) {
    return `hsl(${stateData.color.h}, ${stateData.color.s / 10}%, ${30 + (stateData.color.v / 1000) * 40}%)`;
  }
  const warm = 30 + ((stateData.colorTemp ?? 500) / 1000) * 30;
  const sat = 80 - ((stateData.colorTemp ?? 500) / 1000) * 30;
  const light = 20 + ((stateData.brightness ?? 500) / 1000) * 40;
  return `hsl(${warm}, ${sat}%, ${light}%)`;
}

function getGlowSize(stateData) {
  if (!stateData?.power) return 0;
  return 20 + ((stateData.brightness ?? 500) / 1000) * 40;
}

// ── Room Layout ───────────────────────────────────────────────────────────────

export default function RoomLayout() {
  const [bulbs, setBulbs] = useState([]);
  const [stateData, setStateData] = useState({});
  const [groups, setGroups] = useState([]);
  const [positions, setPositions] = useState({});
  const [dragging, setDragging] = useState(null);
  const [canvasRect, setCanvasRect] = useState({ width: 800, height: 500 });
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((d) => {
        setBulbs(d.bulbs || []);
        setStateData(d.state || {});
        const pos = {};
        (d.bulbs || []).forEach((b) => {
          if (b.position) pos[b.id] = b.position;
        });
        if (Object.keys(pos).length) setPositions(pos);
      })
      .catch(() => {});

    fetch("/api/groups")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups || []));
    socket.on("bulbs:list", (list) => {
      setBulbs(list);
      const pos = {};
      list.forEach((b) => {
        if (b.position) pos[b.id] = b.position;
      });
      if (Object.keys(pos).length) setPositions(pos);
    });
    socket.on("state:update", (s) => setStateData(s));
    socket.on("groups:update", (gs) => setGroups(gs));
    return () => {
      socket.off("bulbs:list");
      socket.off("state:update");
      socket.off("groups:update");
    };
  }, []);

  // ── Canvas resize observer ───────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasRect({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Auto-layout fallback ────────────────────────────────────────────────────
  const autoPos = useMemo(() => calcAutoPositions(bulbs), [bulbs]);

  const getPos = useCallback(
    (bulb) => positions[bulb.id] || autoPos[bulb.id] || { x: 50, y: 50 },
    [positions, autoPos],
  );

  // ── Group zone bounding boxes ───────────────────────────────────────────────
  const groupZones = useMemo(() => {
    return groups.map((g, i) => {
      const gBulbs = g.bulbs
        .map((id) => bulbs.find((b) => b.id === id))
        .filter(Boolean);
      if (gBulbs.length === 0) return null;
      const pts = gBulbs.map((b) => getPos(b));
      const pad = 4;
      return {
        ...g,
        color: GROUP_COLORS[i % GROUP_COLORS.length],
        left: Math.max(0, Math.min(...pts.map((p) => p.x)) - pad),
        top: Math.max(0, Math.min(...pts.map((p) => p.y)) - pad),
        right: Math.min(100, Math.max(...pts.map((p) => p.x)) + pad),
        bottom: Math.min(100, Math.max(...pts.map((p) => p.y)) + pad),
      };
    }).filter(Boolean);
  }, [groups, bulbs, getPos]);

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e, bulbId) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const bulb = bulbs.find((b) => b.id === bulbId);
      const pos = getPos(bulb);
      e.target.setPointerCapture(e.pointerId);
      dragRef.current = {
        id: bulbId,
        originX: (pos.x / 100) * rect.width,
        originY: (pos.y / 100) * rect.height,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      setDragging(bulbId);
    },
    [bulbs, getPos],
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const { originX, originY, startX, startY } = dragRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
      const newX = Math.max(0, Math.min(100, ((originX + dx) / rect.width) * 100));
      const newY = Math.max(0, Math.min(100, ((originY + dy) / rect.height) * 100));
      setPositions((prev) => ({ ...prev, [dragRef.current.id]: { x: newX, y: newY } }));
    },
    [],
  );

  const handlePointerUp = useCallback((e) => {
    if (!dragRef.current?.moved) {
      // Tap — toggle bulb group assignment
      const bulbId = dragRef.current.id;
      // Find which group the bulb belongs to and reassign
      // Simple: assign to next group
      setDragging(null);
      dragRef.current = null;
      return;
    }
    const { id } = dragRef.current;
    const pos = positions[id];
    if (pos) {
      // Save position to server
      fetch(`/api/bulbs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: pos }),
      }).catch(() => {});
    }
    setDragging(null);
    dragRef.current = null;
  }, [positions]);

  // ── Tap handler ──────────────────────────────────────────────────────────────
  const handleTap = useCallback((bulbId) => {
    // Toggle power on tap
    socket.emit("bulb:set", { id: bulbId, params: { power: !stateData[bulbId]?.power } });
  }, [stateData]);

  // ── Group assignment popup ───────────────────────────────────────────────────
  const [assignPopup, setAssignPopup] = useState(null);

  const handleLongPress = useCallback((bulbId, e) => {
    setAssignPopup(assignPopup?.id === bulbId ? null : { id: bulbId, x: e.clientX, y: e.clientY });
  }, [assignPopup]);

  const assignToGroup = async (bulbId, groupId) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const current = group.bulbs || [];
    const updated = current.includes(bulbId)
      ? current.filter((b) => b !== bulbId)
      : [...current, bulbId];
    await fetch(`/api/groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulbs: updated }),
    });
    setAssignPopup(null);
  };

  // ── No bulbs state ────────────────────────────────────────────────────────────
  if (bulbs.length === 0) {
    return (
      <div style={styles.emptyWrap}>
        <span style={{ fontSize: 40 }}>🏠</span>
        <div style={styles.emptyTitle}>No bulbs yet</div>
        <div style={styles.emptySub}>Pair some bulbs in Settings, then arrange them here.</div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.topBar}>
        <div>
          <div style={styles.title}>Room Layout</div>
          <div style={styles.sub}>Drag bulbs to match your room. Tap to toggle power. Long-press to assign groups.</div>
        </div>
        <span style={styles.badge}>
          {bulbs.length} bulb{bulbs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Legend */}
      {groups.length > 0 && (
        <div style={styles.legend}>
          {groups.map((g, i) => (
            <span key={g.id} style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: GROUP_COLORS[i % GROUP_COLORS.length].border }} />
              {g.name} ({g.bulbs.length})
            </span>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="room-layout-canvas"
        style={styles.canvas}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Grid pattern */}
        <svg style={styles.gridSvg} width="100%" height="100%">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeWidth="0.5" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Group zones */}
        {groupZones.map((z) => (
          <div
            key={z.id}
            style={{
              position: "absolute",
              left: `${z.left}%`,
              top: `${z.top}%`,
              width: `${z.right - z.left}%`,
              height: `${z.bottom - z.top}%`,
              background: z.color.bg,
              border: `1px dashed ${z.color.border}40`,
              borderRadius: 16,
              pointerEvents: "none",
              transition: "all 0.3s ease",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 4,
                left: 8,
                fontSize: 9,
                color: z.color.border,
                fontFamily: "'DM Mono',monospace",
                fontWeight: 700,
                letterSpacing: "0.04em",
                opacity: 0.6,
              }}
            >
              {z.name}
            </span>
          </div>
        ))}

        {/* Bulbs */}
        {bulbs.map((bulb) => {
          const pos = getPos(bulb);
          const sd = stateData[bulb.id];
          const glowColor = getGlowColor(sd);
          const glowSize = getGlowSize(sd);
          const isDragging = dragging === bulb.id;
          const groupIdx = groups.findIndex((g) => (g.bulbs || []).includes(bulb.id));
          const groupColor = groupIdx >= 0 ? GROUP_COLORS[groupIdx % GROUP_COLORS.length] : null;

          return (
            <motion.div
              key={bulb.id}
              layout
              style={{
                position: "absolute",
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isDragging ? 100 : 10,
                cursor: isDragging ? "grabbing" : "grab",
                userSelect: "none",
                touchAction: "none",
                transition: isDragging ? "none" : "left 0.15s ease, top 0.15s ease",
              }}
              onPointerDown={(e) => {
                handlePointerDown(e, bulb.id);
                // Detect long press for group assignment
                const start = Date.now();
                const onUp = () => {
                  const elapsed = Date.now() - start;
                  if (elapsed < 200 && !dragRef.current?.moved) handleTap(bulb.id);
                  if (elapsed >= 400 && !dragRef.current?.moved) handleLongPress(bulb.id, e);
                  e.target.removeEventListener("pointerup", onUp);
                };
                e.target.addEventListener("pointerup", onUp);
              }}
            >
              {/* Glow ring */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: glowSize,
                  height: glowSize,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${glowColor}66, ${glowColor}00)`,
                  transition: "all 0.3s ease",
                  pointerEvents: "none",
                }}
              />

              {/* Bulb visual */}
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background: groupColor
                    ? `linear-gradient(135deg, ${groupColor.bg}aa, var(--surface2))`
                    : "var(--surface2)",
                  border: `2px solid ${groupColor ? groupColor.border : "var(--border)"}`,
                  boxShadow: sd?.power
                    ? `0 0 ${12 + glowSize}px ${glowColor}44, inset 0 0 20px ${glowColor}22`
                    : "none",
                  transition: "all 0.3s ease",
                  position: "relative",
                }}
              >
                {/* Group letter */}
                {groupIdx >= 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: GROUP_COLORS[groupIdx % GROUP_COLORS.length].border,
                      color: "#0a0a0b",
                      fontSize: 9,
                      fontWeight: 800,
                      fontFamily: "'DM Mono',monospace",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {String.fromCharCode(65 + groupIdx)}
                  </span>
                )}

                {/* Icon */}
                <span style={{ fontSize: 22, lineHeight: 1 }}>{bulb.icon || "💡"}</span>

                {/* Name */}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: sd?.power ? "var(--text)" : "var(--text3)",
                    fontFamily: "'DM Mono',monospace",
                    lineHeight: 1.1,
                    textAlign: "center",
                    maxWidth: 64,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {bulb.name}
                </span>
              </div>
            </motion.div>
          );
        })}

        {/* Empty canvas hint */}
        {bulbs.length > 0 && !Object.keys(positions).length && (
          <div style={styles.dragHint}>
            <span style={{ fontSize: 14 }}>👆</span>
            Drag bulbs to match your room layout
          </div>
        )}
      </div>

      {/* Group assignment popup */}
      <AnimatePresence>
        {assignPopup && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{
              ...styles.assignPopup,
              position: "fixed",
            }}
          >
            <div style={styles.popupTitle}>Assign to group</div>
            <div style={styles.popupBulbs}>
              {bulbs.find((b) => b.id === assignPopup.id)?.name}
            </div>
            {groups.map((g, i) => (
              <button
                key={g.id}
                onClick={() => assignToGroup(assignPopup.id, g.id)}
                style={{
                  ...styles.popupBtn,
                  borderColor: (g.bulbs || []).includes(assignPopup.id)
                    ? GROUP_COLORS[i % GROUP_COLORS.length].border
                    : "var(--border2)",
                  background: (g.bulbs || []).includes(assignPopup.id)
                    ? GROUP_COLORS[i % GROUP_COLORS.length].bg
                    : "transparent",
                }}
              >
                <span style={{ ...styles.popupDot, background: GROUP_COLORS[i % GROUP_COLORS.length].border }} />
                {g.name}
                {(g.bulbs || []).includes(assignPopup.id) && (
                  <span style={styles.popupCheck}>✓</span>
                )}
              </button>
            ))}
            <button onClick={() => setAssignPopup(null)} style={styles.popupClose}>
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 },

  topBar: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 18, fontWeight: 800, color: "var(--text)" },
  sub: {
    fontSize: 11,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    marginTop: 4,
    maxWidth: 480,
  },
  badge: {
    fontSize: 10,
    padding: "3px 10px",
    borderRadius: 10,
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    color: "var(--text2)",
    fontFamily: "'DM Mono',monospace",
  },

  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    padding: "8px 12px",
    borderRadius: 8,
    background: "var(--surface)",
    border: "1px solid var(--border)",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "var(--text2)",
    fontFamily: "'DM Mono',monospace",
  },
  legendDot: { width: 8, height: 8, borderRadius: "50%" },

  canvas: {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 9",
    minHeight: 320,
    background: "var(--bg)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    overflow: "hidden",
    touchAction: "none",
  },
  gridSvg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },

  dragHint: {
    position: "absolute",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    padding: "8px 16px",
    borderRadius: 8,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    pointerEvents: "none",
    opacity: 0.7,
  },

  emptyWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 60,
    textAlign: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: "var(--text2)" },
  emptySub: {
    fontSize: 12,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    maxWidth: 300,
  },

  assignPopup: {
    bottom: 20,
    right: 20,
    zIndex: 200,
    background: "var(--surface)",
    border: "1px solid var(--border2)",
    borderRadius: 12,
    padding: 14,
    minWidth: 200,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  popupTitle: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.06em",
    marginBottom: 2,
  },
  popupBulbs: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 6,
  },
  popupBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid",
    background: "transparent",
    color: "var(--text)",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
    transition: "all 0.15s",
    textAlign: "left",
  },
  popupDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  popupCheck: {
    marginLeft: "auto",
    color: "var(--accent)",
    fontWeight: 700,
  },
  popupClose: {
    width: "100%",
    padding: "6px",
    borderRadius: 6,
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    color: "var(--text2)",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
    marginTop: 4,
  },
};