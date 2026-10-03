import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import socket from "../socket";

// ── Collapsible section ───────────────────────────────────────────────────────
function CollapsibleSection({ id, title, icon, badge, info, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen !== false);
  return (
    <div style={cs.section}>
      <button onClick={() => setOpen((v) => !v)} style={cs.header}>
        <div style={cs.headerLeft}>
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            style={cs.chevron}
          >▸</motion.span>
          {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
          <span style={cs.title}>{title}</span>
          {badge != null && <span style={cs.badge}>{badge}</span>}
        </div>
        <div style={cs.headerRight}>
          {info && <span style={cs.info}>{info}</span>}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div style={cs.content}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const cs = {
  section: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "14px 16px",
    background: "transparent",
    border: "none",
    color: "var(--text)",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    transition: "background 0.15s",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  chevron: {
    fontSize: 12,
    color: "var(--text3)",
    width: 16,
    flexShrink: 0,
    fontFamily: "'DM Mono',monospace",
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text)",
  },
  badge: {
    fontSize: 9,
    padding: "2px 7px",
    borderRadius: 8,
    background: "var(--accent)",
    color: "#0a0a0b",
    fontWeight: 700,
    fontFamily: "'DM Mono',monospace",
  },
  info: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    whiteSpace: "nowrap",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  content: {
    padding: "0 16px 16px",
  },
};

// ── Stagger animation variants ────────────────────────────────────────────────
const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.2 } }),
};

const staggerContainer = {
  show: { transition: { staggerChildren: 0.04 } },
};

// ── Room icon picker ──────────────────────────────────────────────────────────
const ROOM_ICONS = [
  { id: "bedroom", icon: "🛏", label: "Bedroom" },
  { id: "hall", icon: "🚪", label: "Hall" },
  { id: "livingroom", icon: "🛋", label: "Living Room" },
  { id: "kitchen", icon: "🍳", label: "Kitchen" },
  { id: "bathroom", icon: "🚿", label: "Bathroom" },
  { id: "office", icon: "💼", label: "Office" },
  { id: "study", icon: "📚", label: "Study" },
  { id: "laundry", icon: "🫧", label: "Laundry" },
  { id: "garage", icon: "🏠", label: "Garage" },
  { id: "garden", icon: "🌿", label: "Garden" },
  { id: "dining", icon: "🍽", label: "Dining" },
  { id: "lounge", icon: "🛋", label: "Lounge" },
  { id: "outdoor", icon: "🌿", label: "Outdoor" },
  { id: "closet", icon: "👔", label: "Closet" },
  { id: "stairs", icon: "🪜", label: "Stairs" },
  { id: "generic", icon: "💡", label: "Other" },
];

function getIconForId(id) {
  return ROOM_ICONS.find((r) => r.id === id)?.icon || "💡";
}

function idFromName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "bulb";
}

// ── Pairing / Edit form ──────────────────────────────────────────────────────

function BulbForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [iconId, setIconId] = useState(
    initial?.icon
      ? (ROOM_ICONS.find((r) => r.icon === initial.icon)?.id || "generic")
      : "generic",
  );
  const [localKey, setLocalKey] = useState(initial?.localKey || "");
  const [fetchingKey, setFetchingKey] = useState(false);
  const [extractingKey, setExtractingKey] = useState(false);
  const [keySource, setKeySource] = useState(null); // "cloud" | "lan" | "devices_json" | "manual"
  const [keyError, setKeyError] = useState(null);

  const deviceId = initial?.deviceId || "";
  const id = initial?.id || idFromName(name);

  // Auto-check devices.json for this device on mount
  useEffect(() => {
    if (!deviceId || localKey) return;
    fetch("/api/bulbs/keys-from-devices-json")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.keys?.[deviceId]) {
          setLocalKey(data.keys[deviceId]);
          setKeySource("devices_json");
        }
      })
      .catch(() => {});
  }, [deviceId]);

  const handleFetchKey = useCallback(async () => {
    if (!deviceId) return;
    setFetchingKey(true);
    setKeyError(null);
    try {
      const res = await fetch(`/api/bulbs/tuya-key/${deviceId}`);
      const data = await res.json();
      if (data.localKey) { setLocalKey(data.localKey); setKeySource("cloud"); setKeyError(null); }
      else { setKeyError("Cloud fetch failed. Tuya IoT plan may be expired."); }
    } catch (e) {
      setKeyError("Cloud fetch error. Check your internet connection.");
    }
    setFetchingKey(false);
  }, [deviceId]);

  const handleExtractKey = useCallback(async () => {
    if (!deviceId || !initial?.ip) return;
    setExtractingKey(true);
    setKeyError(null);
    try {
      const res = await fetch("/api/bulbs/lan-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, ip: initial.ip, version: initial.version || "3.5" }),
      });
      const data = await res.json();
      if (data.ok && data.localKey) { setLocalKey(data.localKey); setKeySource(data.source || "lan"); setKeyError(null); }
      else {
        setKeyError(data.error || "Could not extract key. Try the cloud fetch or run: python3 -m tinytuya wizard");
      }
    } catch (e) {
      setKeyError("Connection error. Ensure the bulb is powered on and on the same network.");
    }
    setExtractingKey(false);
  }, [deviceId, initial?.ip, initial?.version]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id || idFromName(name),
      name: name.trim(),
      icon: getIconForId(iconId),
      ...(initial?.protocol && { protocol: initial.protocol }),
      ...(initial?.deviceId && { deviceId: initial.deviceId }),
      ...(initial?.version && { version: initial.version }),
      ...(initial?.ip && { ip: initial.ip }),
      ...(initial?.mac && { mac: initial.mac }),
      ...(localKey ? { localKey } : {}),
    });
  };

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      onSubmit={handleSubmit}
      style={s.form}
    >
      <div style={s.formFields}>
        <div style={s.field}>
          <label style={s.fieldLabel}>Name</label>
          <input
            style={s.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kitchen Table"
            autoFocus
          />
          {!initial?.id && (
            <div style={s.fieldHint}>ID: {idFromName(name) || "bulb"}</div>
          )}
        </div>

        <div style={s.field}>
          <label style={s.fieldLabel}>Room Icon</label>
          <div style={s.iconGrid}>
            {ROOM_ICONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setIconId(r.id)}
                style={{
                  ...s.iconBtn,
                  borderColor: iconId === r.id ? "var(--accent)" : "var(--border)",
                  background: iconId === r.id ? "#f5c84218" : "transparent",
                }}
                title={r.label}
              >
                <span style={{ fontSize: 20 }}>{r.icon}</span>
              </button>
            ))}
          </div>
        </div>

        {initial?.protocol === "tuya" && initial?.deviceId && (
          <div style={s.field}>
            <label style={s.fieldLabel}>
              Local Key
              {keySource && (
                <span style={{ ...s.fieldHint, marginLeft: 8, display: "inline" }}>
                  · found via <strong>{keySource.replace("_", " ")}</strong>
                </span>
              )}
            </label>
            <div style={{ ...s.keyRow, marginBottom: 6 }}>
              <input
                style={{ ...s.input, flex: 1, fontFamily: "'DM Mono',monospace" }}
                value={localKey}
                onChange={(e) => { setLocalKey(e.target.value); setKeySource("manual"); }}
                placeholder="Auto-fetch, extract from LAN, or paste here"
              />
            </div>
            <div style={s.keyActions}>
              <button
                type="button"
                onClick={handleFetchKey}
                disabled={fetchingKey}
                style={{
                  ...s.extractBtn,
                  background: fetchingKey ? "var(--surface2)" : "#4488ff20",
                  color: fetchingKey ? "var(--text3)" : "#4488ff",
                  borderColor: fetchingKey ? "var(--border2)" : "#4488ff60",
                }}
              >
                {fetchingKey ? "..." : "☁ Fetch from Cloud"}
              </button>
              <button
                type="button"
                onClick={handleExtractKey}
                disabled={extractingKey}
                style={{
                  ...s.extractBtn,
                  background: extractingKey ? "var(--surface2)" : "#22cc8820",
                  color: extractingKey ? "var(--text3)" : "#22cc88",
                  borderColor: extractingKey ? "var(--border2)" : "#22cc8860",
                }}
              >
                {extractingKey ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: "inline-block" }}>⟳</motion.span>
                    Extracting...
                  </span>
                ) : (
                  "📡 Get Key from LAN"
                )}
              </button>
            </div>
            {keyError && (
              <div style={s.keyErrorBox}>
                ⚠ {keyError}
              </div>
            )}
            <div style={s.fieldHint}>
              Without the key, LAN control won't work. Try Cloud → LAN → or paste from devices.json.
            </div>
          </div>
        )}

        {initial?.ip && (
          <div style={s.deviceInfo}>
            <span style={s.deviceInfoLabel}>
              {initial.protocol === "wiz" ? "📡 WiZ" : "🔗 Tuya"}
            </span>
            <span style={s.deviceInfoValue}>{initial.ip}</span>
            {initial.mac && (
              <span style={s.deviceInfoSub}>{initial.mac}</span>
            )}
            {initial.deviceId && (
              <span style={s.deviceInfoSub}>{initial.deviceId}</span>
            )}
          </div>
        )}
      </div>

      <div style={s.formActions}>
        <button type="button" onClick={onCancel} style={s.cancelBtn}>
          Cancel
        </button>
        <button type="submit" style={s.saveBtn} disabled={!name.trim()}>
          {initial?.id ? "Save Changes" : "Pair Bulb"}
        </button>
      </div>
    </motion.form>
  );
}

// ── Discovered device card ───────────────────────────────────────────────────

function DiscoveredCard({ device, protocol, onPair }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={s.discoveredCard}
    >
      <div style={s.discoveredLeft}>
        <span style={s.protocolBadge}>
          {protocol === "tuya" ? "TUYA" : "WiZ"}
        </span>
        <div style={s.discoveredInfo}>
          <div style={s.discoveredIp}>{device.ip}</div>
          {protocol === "tuya" && (
            <div style={s.discoveredSub}>
              {device.gwId} · v{device.version}
            </div>
          )}
          {protocol === "wiz" && device.mac && (
            <div style={s.discoveredSub}>{device.mac}</div>
          )}
          {protocol === "tuya" && device.product_name && (
            <div style={s.discoveredProduct}>{device.product_name}</div>
          )}
        </div>
      </div>
      <button onClick={() => onPair(device)} style={s.pairBtn}>
        Pair
      </button>
    </motion.div>
  );
}

// ── Configured bulb card ─────────────────────────────────────────────────────

function ConfiguredCard({ bulb, onEdit, onDelete }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={s.bulbCard}
    >
      <div style={s.bulbLeft}>
        <span style={s.bulbIcon}>{bulb.icon || "💡"}</span>
        <div style={s.bulbInfo}>
          <div style={s.bulbName}>{bulb.name}</div>
          <div style={s.bulbMeta}>
            <span style={s.protocolBadgeSmall}>
              {bulb.protocol === "wiz" ? "WiZ" : "Tuya"}
            </span>
            <span style={s.bulbIp}>{bulb.ip}</span>
            <span style={s.bulbId}>{bulb.id}</span>
          </div>
        </div>
      </div>
      <div style={s.bulbActions}>
        <button onClick={() => onEdit(bulb)} style={s.actionBtn} title="Edit">
          ✎
        </button>
        <button onClick={() => onDelete(bulb)} style={s.delBtn} title="Remove">
          ✕
        </button>
      </div>
    </motion.div>
  );
}

// ── Main DevicesPanel ────────────────────────────────────────────────────────

export default function DevicesPanel() {
  const [bulbs, setBulbs] = useState([]);

  // Discovery state
  const [scanningTuya, setScanningTuya] = useState(false);
  const [scanningWiz, setScanningWiz] = useState(false);
  const [tuyaDevices, setTuyaDevices] = useState([]);
  const [wizDevices, setWizDevices] = useState([]);
  const [scanError, setScanError] = useState(null);

  // Pairing/editing state
  const [pairingDevice, setPairingDevice] = useState(null); // {device, protocol}
  const [editingBulb, setEditingBulb] = useState(null);

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Groups state
  const [groups, setGroups] = useState([]);
  const [editingGroup, setEditingGroup] = useState(null); // {id, name, bulbs}
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Load initial bulbs + groups
  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((data) => setBulbs(data.bulbs || []))
      .catch(() => {});

    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => setGroups(data.groups || []))
      .catch(() => {});

    socket.on("bulbs:list", (list) => setBulbs(list));
    socket.on("groups:update", (gs) => setGroups(gs));
    return () => { socket.off("bulbs:list"); socket.off("groups:update"); };
  }, []);

  // ── Group handlers ─────────────────────────────────────────────────────────

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim(), bulbs: [] }),
      });
      const data = await res.json();
      if (data.ok) { setNewGroupName(""); setCreatingGroup(false); }
      else throw new Error(data.error);
    } catch (e) { alert(`Create group failed: ${e.message}`); }
  };

  const handleUpdateGroup = async (id, updates) => {
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setEditingGroup(null);
    } catch (e) { alert(`Update group failed: ${e.message}`); }
  };

  const handleDeleteGroup = async (id) => {
    try {
      const res = await fetch(`/api/groups/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch (e) { alert(`Delete group failed: ${e.message}`); }
  };

  const toggleBulbInGroup = (groupId, bulbId) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const current = group.bulbs || [];
    const updated = current.includes(bulbId)
      ? current.filter((b) => b !== bulbId)
      : [...current, bulbId];
    handleUpdateGroup(groupId, { bulbs: updated });
  };

  // ── Scan handlers ──────────────────────────────────────────────────────────

  const scanTuya = useCallback(async () => {
    setScanningTuya(true);
    setScanError(null);
    try {
      const res = await fetch("/api/scan/tuya", { method: "POST" });
      const data = await res.json();
      setTuyaDevices(data.devices || []);
    } catch (e) {
      setScanError(e.message);
    }
    setScanningTuya(false);
  }, []);

  const scanWiz = useCallback(async () => {
    setScanningWiz(true);
    setScanError(null);
    try {
      const res = await fetch("/api/scan/wiz", { method: "POST" });
      const data = await res.json();
      setWizDevices(data.devices || []);
    } catch (e) {
      setScanError(e.message);
    }
    setScanningWiz(false);
  }, []);

  // ── Pair / Save / Delete ──────────────────────────────────────────────────

  const handlePair = (device) => {
    const protocol = tuyaDevices.includes(device) ? "tuya" : "wiz";
    setPairingDevice({ device, protocol });
  };

  const handleSavePair = async (formData) => {
    try {
      const res = await fetch("/api/bulbs/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setPairingDevice(null);
      setTuyaDevices((prev) => prev.filter((d) => d.ip !== formData.ip));
      setWizDevices((prev) => prev.filter((d) => d.ip !== formData.ip));
    } catch (e) {
      alert(`Pair failed: ${e.message}`);
    }
  };

  const handleEdit = (bulb) => {
    setEditingBulb(bulb);
  };

  const handleSaveEdit = async (formData) => {
    try {
      const res = await fetch(`/api/bulbs/${formData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setEditingBulb(null);
    } catch (e) {
      alert(`Update failed: ${e.message}`);
    }
  };

  const handleDelete = (bulb) => {
    setConfirmDelete(bulb);
  };

  const confirmRemoval = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/bulbs/${confirmDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setConfirmDelete(null);
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  return (
    <div className="devices-panel-wrap" style={s.wrap}>
      <div style={s.header}>
        <div style={s.title}>Device Settings</div>
        <div style={s.sub}>
          Discover, pair, and manage your smart bulbs
        </div>
      </div>

      {/* ── Configured Devices ────────────────────────────────────────────── */}
      <CollapsibleSection title="Configured Devices" icon="💡" badge={bulbs.length} info={`${bulbs.length} bulb${bulbs.length !== 1 ? "s" : ""}`} defaultOpen={true}>
        {bulbs.length === 0 ? (
          <div style={s.emptyState}>
            No bulbs configured yet. Scan for devices below.
          </div>
        ) : (
          <motion.div style={s.bulbList} variants={staggerContainer} initial="hidden" animate="show">
            <AnimatePresence>
              {bulbs.map((b, i) =>
                editingBulb?.id === b.id ? (
                  <BulbForm
                    key={b.id}
                    initial={editingBulb}
                    onSave={handleSaveEdit}
                    onCancel={() => setEditingBulb(null)}
                  />
                ) : (
                  <motion.div key={b.id} custom={i} variants={staggerItem}>
                    <ConfiguredCard
                      bulb={b}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </motion.div>
                ),
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </CollapsibleSection>

      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={s.confirmBox}
          >
            <span>
              Remove <strong>{confirmDelete.name}</strong> ({confirmDelete.id})?
            </span>
            <div style={s.confirmActions}>
              <button onClick={() => setConfirmDelete(null)} style={s.cancelSmBtn}>
                Cancel
              </button>
              <button onClick={confirmRemoval} style={s.deleteSmBtn}>
                Remove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bulb Groups (BPM Pattern Groups) ───────────────────────────────── */}
      <CollapsibleSection title="Bulb Groups" icon="🎯" info={`${groups.length} group${groups.length !== 1 ? "s" : ""}`} defaultOpen={true}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>
            <span style={{ marginRight: 6 }}>🎯</span>
            Bulb Groups
          </span>
          <span style={s.scanInfo}>
            Groups define how patterns (counterpoint, chase, etc.) are mapped to your bulbs
          </span>
        </div>

        {/* Group cards */}
        <div style={s.groupList}>
          <AnimatePresence>
            {groups.map((g) => (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={s.groupCard}
              >
                <div style={s.groupTop}>
                  <div style={s.groupName}>{g.name}</div>
                  <div style={s.groupActions}>
                    <button
                      onClick={() => setEditingGroup(editingGroup?.id === g.id ? null : g)}
                      style={{ ...s.actionBtn, color: editingGroup?.id === g.id ? "var(--accent)" : "var(--text2)" }}
                    >
                      {editingGroup?.id === g.id ? "−" : "✎"}
                    </button>
                    <button onClick={() => handleDeleteGroup(g.id)} style={s.delBtn}>✕</button>
                  </div>
                </div>

                {/* Assigned bulbs */}
                <div style={s.groupBulbs}>
                  {g.bulbs.length === 0 ? (
                    <span style={s.groupEmpty}>No bulbs assigned — click ✎ to assign</span>
                  ) : (
                    g.bulbs.map((bId) => {
                      const b = bulbs.find((bb) => bb.id === bId);
                      return (
                        <span key={bId} style={s.groupBulbTag}>
                          {b?.icon || "💡"} {b?.name || bId}
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Editable bulb picker */}
                <AnimatePresence>
                  {editingGroup?.id === g.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={s.pickerHint}>Tap bulbs to assign to this group:</div>
                      <div style={s.pickerGrid}>
                        {bulbs.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => toggleBulbInGroup(g.id, b.id)}
                            style={{
                              ...s.pickerBtn,
                              borderColor: (g.bulbs || []).includes(b.id) ? "var(--accent)" : "var(--border2)",
                              background: (g.bulbs || []).includes(b.id) ? "#f5c84218" : "var(--surface)",
                            }}
                          >
                            <span style={{ fontSize: 16 }}>{b.icon || "💡"}</span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: (g.bulbs || []).includes(b.id) ? 700 : 400,
                              color: (g.bulbs || []).includes(b.id) ? "var(--accent)" : "var(--text2)",
                            }}>
                              {b.name}
                            </span>
                          </button>
                        ))}
                      </div>
                      {bulbs.length === 0 && (
                        <div style={s.groupEmpty}>Pair some bulbs first!</div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Create group */}
        <AnimatePresence>
          {creatingGroup ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={s.createGroupRow}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); }}
                />
                <button onClick={handleCreateGroup} style={s.saveBtn} disabled={!newGroupName.trim()}>
                  Create
                </button>
                <button onClick={() => { setCreatingGroup(false); setNewGroupName(""); }} style={s.cancelBtn}>
                  Cancel
                </button>
              </div>
            </motion.div>
          ) : (
            <button onClick={() => setCreatingGroup(true)} style={s.addGroupBtn}>
              + New Group
            </button>
          )}
        </AnimatePresence>

        {groups.length === 0 && !creatingGroup && (
          <div style={s.hint}>
            Create groups to assign which bulbs play which role in BPM patterns
          </div>
        )}
      </CollapsibleSection>

      {/* ── Scan Error ────────────────────────────────────────────────────── */}
      {scanError && (
        <div style={s.errorBox}>
          ⚠ {scanError}
          <button onClick={() => setScanError(null)} style={s.dismissBtn}>
            ✕
          </button>
        </div>
      )}

      {/* ── Discovery Sections ────────────────────────────────────────────── */}

      {/* Tuya Discovery */}
      <CollapsibleSection title="Tuya Bulbs" icon="🔗" info="Scans LAN for Tuya-compatible smart bulbs" defaultOpen={false}>
        <button
          onClick={scanTuya}
          disabled={scanningTuya}
          style={{
            ...s.scanBtn,
            background: scanningTuya ? "var(--surface2)" : "var(--accent)",
            color: scanningTuya ? "var(--text2)" : "#0a0a0b",
          }}
        >
          {scanningTuya ? (
            <span style={s.scanningRow}>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                style={{ display: "inline-block" }}
              >
                ⟳
              </motion.span>
              Scanning...
            </span>
          ) : (
            "Scan for Tuya Bulbs"
          )}
        </button>
        {scanningTuya && (
          <div style={s.scanNote}>
            Broadcasting on LAN — this takes ~10 seconds
          </div>
        )}
        <AnimatePresence>
          {tuyaDevices.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={s.discoveredList}
            >
              <div style={s.discoveredHeader}>
                {tuyaDevices.length} device(s) found
              </div>
              {tuyaDevices.map((d) => (
                <div key={d.gwId}>
                  {pairingDevice?.device?.gwId === d.gwId &&
                  pairingDevice?.protocol === "tuya" ? (
                    <BulbForm
                      initial={{
                        ...d,
                        protocol: "tuya",
                        deviceId: d.gwId,
                        id: d.gwId || idFromName(d.product_name || "tuya_bulb"),
                      }}
                      onSave={handleSavePair}
                      onCancel={() => setPairingDevice(null)}
                    />
                  ) : (
                    <DiscoveredCard
                      device={d}
                      protocol="tuya"
                      onPair={handlePair}
                    />
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {!scanningTuya && tuyaDevices.length === 0 && (
          <div style={s.hint}>
            No Tuya devices discovered yet. Tap the scan button.
          </div>
        )}
      </CollapsibleSection>

      {/* WiZ Discovery */}
      <CollapsibleSection title="Philips WiZ Bulbs" icon="📡" info="Scans LAN for WiZ-connected smart bulbs" defaultOpen={false}>
        <button
          onClick={scanWiz}
          disabled={scanningWiz}
          style={{
            ...s.scanBtn,
            background: scanningWiz ? "var(--surface2)" : "var(--accent)",
            color: scanningWiz ? "var(--text2)" : "#0a0a0b",
          }}
        >
          {scanningWiz ? (
            <span style={s.scanningRow}>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                style={{ display: "inline-block" }}
              >
                ⟳
              </motion.span>
              Scanning...
            </span>
          ) : (
            "Scan for WiZ Bulbs"
          )}
        </button>
        {scanningWiz && (
          <div style={s.scanNote}>
            Broadcasting on LAN — this takes ~6 seconds
          </div>
        )}
        <AnimatePresence>
          {wizDevices.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={s.discoveredList}
            >
              <div style={s.discoveredHeader}>
                {wizDevices.length} device(s) found
              </div>
              {wizDevices.map((d) => (
                <div key={d.mac || d.ip}>
                  {pairingDevice?.device?.ip === d.ip &&
                  pairingDevice?.protocol === "wiz" ? (
                    <BulbForm
                      initial={{
                        ...d,
                        protocol: "wiz",
                        id: d.mac || d.ip || idFromName("wiz_bulb"),
                      }}
                      onSave={handleSavePair}
                      onCancel={() => setPairingDevice(null)}
                    />
                  ) : (
                    <DiscoveredCard
                      device={d}
                      protocol="wiz"
                      onPair={handlePair}
                    />
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {!scanningWiz && wizDevices.length === 0 && (
          <div style={s.hint}>
            No WiZ devices discovered yet. Tap the scan button.
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 },

  header: { marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 800, color: "var(--text)" },
  sub: {
    fontSize: 12,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    marginTop: 4,
  },

  section: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    padding: 18,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
  },
  badge: {
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 10,
    background: "var(--accent)",
    color: "#0a0a0b",
    fontWeight: 700,
    fontFamily: "'DM Mono',monospace",
  },
  scanInfo: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    flex: 1,
  },

  emptyState: {
    fontSize: 12,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    padding: 20,
    textAlign: "center",
  },

  bulbList: { display: "flex", flexDirection: "column", gap: 8 },

  // ── Groups ─────────────────────────────────────────────────────────────
  groupList: { display: "flex", flexDirection: "column", gap: 10 },
  groupCard: {
    padding: "14px 16px",
    borderRadius: 10,
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    transition: "border-color 0.15s",
  },
  groupTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  groupName: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  groupActions: { display: "flex", gap: 4 },
  groupBulbs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  groupBulbTag: {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 6,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--text2)",
    fontFamily: "'DM Mono',monospace",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  groupEmpty: {
    fontSize: 11,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    fontStyle: "italic",
    padding: "4px 0",
  },
  pickerHint: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    marginBottom: 8,
  },
  pickerGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  pickerBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border2)",
    cursor: "pointer",
    transition: "all 0.15s",
    minWidth: 72,
  },
  addGroupBtn: {
    width: "100%",
    padding: "10px",
    borderRadius: 8,
    background: "transparent",
    border: "1px dashed var(--border2)",
    color: "var(--text3)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
    transition: "all 0.15s",
  },
  createGroupRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },

  // Configured bulb card
  bulbCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderRadius: 10,
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
    transition: "border-color 0.15s",
  },
  bulbLeft: { display: "flex", alignItems: "center", gap: 12, flex: 1 },
  bulbIcon: { fontSize: 22 },
  bulbInfo: {},
  bulbName: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  bulbMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
    flexWrap: "wrap",
  },
  protocolBadgeSmall: {
    fontSize: 8,
    padding: "1px 5px",
    borderRadius: 4,
    background: "#f5c84220",
    color: "var(--accent)",
    fontWeight: 700,
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.04em",
  },
  bulbIp: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
  },
  bulbId: {
    fontSize: 9,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    opacity: 0.6,
  },
  bulbActions: { display: "flex", gap: 4 },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: "1px solid var(--border2)",
    background: "transparent",
    color: "var(--text2)",
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
  },
  delBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: "1px solid var(--offline)",
    background: "transparent",
    color: "var(--offline)",
    fontSize: 11,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
  },

  // Discovered device card
  discoveredCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--surface2)",
    border: "1px solid var(--border2)",
  },
  discoveredLeft: { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  protocolBadge: {
    fontSize: 9,
    fontWeight: 700,
    padding: "3px 7px",
    borderRadius: 5,
    background: "#f5c84220",
    color: "var(--accent)",
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.06em",
  },
  discoveredInfo: {},
  discoveredIp: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text)",
    fontFamily: "'DM Mono',monospace",
  },
  discoveredSub: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    marginTop: 2,
  },
  discoveredProduct: {
    fontSize: 10,
    color: "var(--text2)",
    fontFamily: "'DM Mono',monospace",
    marginTop: 1,
  },
  pairBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    background: "var(--accent)",
    color: "#0a0a0b",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    fontFamily: "'DM Mono',monospace",
    transition: "all 0.15s",
  },
  discoveredList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 6,
  },
  discoveredHeader: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.04em",
    marginBottom: 2,
  },

  // Scan button
  scanBtn: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.04em",
    transition: "all 0.2s",
    boxShadow: "var(--glow-gold)",
  },
  scanningRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  scanNote: {
    fontSize: 10,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    textAlign: "center",
  },

  // Form
  form: {
    padding: "14px 16px",
    borderRadius: 10,
    background: "var(--surface2)",
    border: "1px solid var(--accent)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    overflow: "hidden",
  },
  formFields: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  field: {},
  fieldLabel: {
    fontSize: 11,
    color: "var(--text2)",
    fontWeight: 600,
    marginBottom: 5,
    display: "block",
  },
  fieldHint: {
    fontSize: 9,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    marginTop: 3,
    display: "inline",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg)",
    border: "1px solid var(--border2)",
    color: "var(--text)",
    fontSize: 13,
    fontFamily: "'DM Mono',monospace",
    outline: "none",
    transition: "border-color 0.15s",
  },
  iconGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
  },
  keyActions: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  keyErrorBox: {
    padding: "8px 10px",
    borderRadius: 6,
    background: "#ff4d6d12",
    border: "1px solid var(--offline)",
    color: "var(--offline)",
    fontSize: 10,
    fontFamily: "'DM Mono',monospace",
    lineHeight: 1.5,
  },
  extractBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
    transition: "all 0.15s",
  },
  keyRow: {
    display: "flex",
    gap: 6,
  },
  fetchBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    background: "#4488ff20",
    color: "#4488ff",
    border: "1px solid #4488ff60",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
  },
  deviceInfo: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg)",
    border: "1px solid var(--border2)",
    alignItems: "center",
  },
  deviceInfoLabel: {
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "'DM Mono',monospace",
    color: "var(--accent)",
  },
  deviceInfoValue: {
    fontSize: 11,
    fontFamily: "'DM Mono',monospace",
    color: "var(--text2)",
  },
  deviceInfoSub: {
    fontSize: 9,
    fontFamily: "'DM Mono',monospace",
    color: "var(--text3)",
  },
  formActions: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  },
  cancelBtn: {
    padding: "8px 16px",
    borderRadius: 6,
    background: "var(--surface)",
    border: "1px solid var(--border2)",
    color: "var(--text2)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
  },
  saveBtn: {
    padding: "8px 16px",
    borderRadius: 6,
    background: "var(--gradient-gold)",
    color: "#0a0a0b",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    fontFamily: "'DM Mono',monospace",
    boxShadow: "0 2px 8px rgba(245, 200, 66, 0.2)",
  },

  // Confirm delete
  confirmBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 10,
    background: "#ff4d6d12",
    border: "1px solid var(--offline)",
    fontSize: 12,
    color: "var(--text)",
  },
  confirmActions: { display: "flex", gap: 6 },
  cancelSmBtn: {
    padding: "5px 10px",
    borderRadius: 5,
    background: "var(--surface)",
    border: "1px solid var(--border2)",
    color: "var(--text2)",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
  },
  deleteSmBtn: {
    padding: "5px 12px",
    borderRadius: 5,
    background: "var(--offline)",
    color: "white",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    fontFamily: "'DM Mono',monospace",
  },

  // Error
  errorBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 8,
    background: "#ff4d6d12",
    border: "1px solid var(--offline)",
    fontSize: 11,
    color: "var(--offline)",
    fontFamily: "'DM Mono',monospace",
  },
  dismissBtn: {
    background: "transparent",
    border: "none",
    color: "var(--offline)",
    fontSize: 12,
    cursor: "pointer",
    padding: "2px 6px",
  },

  // Hint
  hint: {
    fontSize: 11,
    color: "var(--text3)",
    fontFamily: "'DM Mono',monospace",
    textAlign: "center",
    padding: "8px 0",
  },
};