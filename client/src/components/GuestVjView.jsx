import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function GuestVjView({ state, bulbs, onRunScene, onSetBpm, onExitGuestMode }) {
  const [tapTimes, setTapTimes] = useState([]);
  const [bpm, setBpm] = useState(120);
  const [activePalette, setActivePalette] = useState('warm');
  const [pinModal, setPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const scenes = [
    { id: 'party', name: 'Party', icon: '⚡️', color: 'linear-gradient(135deg, #f5c842, #ff4d6d)' },
    { id: 'relax', name: 'Relax', icon: '🛋', color: 'linear-gradient(135deg, #f5a842, #f5c842)' },
    { id: 'movie', name: 'Movie', icon: '🍿', color: 'linear-gradient(135deg, #a855f7, #3b82f6)' },
    { id: 'focus', name: 'Focus', icon: '🎯', color: 'linear-gradient(135deg, #38bdf8, #818cf8)' },
    { id: 'nightwalk', name: 'Night Walk', icon: '🌙', color: 'linear-gradient(135deg, #374151, #1f2937)' },
    { id: 'off', name: 'All Off', icon: '💤', color: 'linear-gradient(135deg, #18181b, #09090b)' },
  ];

  const palettes = [
    { id: 'warm', name: 'Warm Amber', color: '#f5a842' },
    { id: 'cyber', name: 'Cyberpunk', color: '#a855f7' },
    { id: 'neon', name: 'Neon Fire', color: '#ff4d6d' },
    { id: 'ocean', name: 'Electric Ocean', color: '#06b6d4' },
  ];

  const handleTap = () => {
    const now = Date.now();
    const recent = [...tapTimes.filter(t => now - t < 3000), now];
    setTapTimes(recent);
    if (recent.length > 1) {
      const intervals = [];
      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i] - recent[i - 1]);
      }
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = Math.round(60000 / avgMs);
      if (newBpm >= 40 && newBpm <= 240) {
        setBpm(newBpm);
        if (onSetBpm) onSetBpm(newBpm);
      }
    }
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pinInput === '1234' || pinInput === '') {
      setPinModal(false);
      onExitGuestMode();
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 1500);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.topBanner}>
        <div>
          <div style={styles.badge}>🎉 GUEST VJ MODE</div>
          <h2 style={styles.title}>Party Light Controller</h2>
        </div>
        <button onClick={() => setPinModal(true)} style={styles.adminBtn} className="btn-touch btn-secondary">
          🔒 Host Admin
        </button>
      </div>

      {/* Live Bulbs Status Visualizer */}
      <div style={styles.orbRow}>
        {bulbs.map((b) => {
          const s = state[b.id] || {};
          const isPowered = s.power;
          const bg = isPowered
            ? s.mode === 'colour' && s.color
              ? `hsl(${s.color.h}, 100%, 50%)`
              : `hsl(40, 100%, ${Math.min(90, Math.max(30, (s.brightness || 500) / 10))}%)`
            : '#181820';

          return (
            <div key={b.id} style={styles.orbCard} className="glass-card">
              <motion.div
                animate={{ scale: isPowered ? [1, 1.06, 1] : 1 }}
                transition={{ duration: 1.5, repeat: isPowered ? Infinity : 0 }}
                style={{
                  ...styles.orb,
                  background: bg,
                  boxShadow: isPowered ? `0 0 20px ${bg}` : 'none',
                }}
              />
              <div style={styles.orbLabel}>{b.name}</div>
              <div style={styles.orbSub} className="mono">
                {isPowered ? `${Math.round(((s.brightness || 500) / 1000) * 100)}%` : 'OFF'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tap Tempo BPM Touch Section */}
      <div style={styles.bpmCard} className="glass-card">
        <div style={styles.bpmHeader}>
          <div>
            <span style={styles.bpmSub}>TEMPO CONTROL</span>
            <div style={styles.bpmNum} className="mono">{bpm} <span style={{ fontSize: 16 }}>BPM</span></div>
          </div>
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 60 / bpm, repeat: Infinity }}
            style={styles.bpmDot}
          />
        </div>
        <button onClick={handleTap} style={styles.tapBtn} className="tap-btn btn-accent btn-touch">
          🥁 TAP TEMPO BEAT
        </button>
      </div>

      {/* Quick One-Tap Scenes */}
      <div style={styles.sectionTitle}>ONE-TAP AMBIANCE SCENES</div>
      <div style={styles.sceneGrid}>
        {scenes.map((sc) => (
          <button
            key={sc.id}
            onClick={() => onRunScene(sc.id)}
            style={{ ...styles.sceneCard, background: sc.color }}
            className="btn-touch"
          >
            <span style={styles.sceneIcon}>{sc.icon}</span>
            <span style={styles.sceneName}>{sc.name}</span>
          </button>
        ))}
      </div>

      {/* Guest Palette Selector */}
      <div style={styles.sectionTitle}>PARTY COLOR PALETTES</div>
      <div style={styles.paletteRow}>
        {palettes.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePalette(p.id)}
            style={{
              ...styles.paletteChip,
              borderColor: activePalette === p.id ? 'var(--accent)' : 'var(--border2)',
            }}
            className="glass-card btn-touch"
          >
            <div style={{ ...styles.colorDot, background: p.color }} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      {/* Host PIN Modal */}
      {pinModal && (
        <div style={styles.modalOverlay}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={styles.modalCard} className="glass-card">
            <h3 style={{ marginBottom: 8 }}>🔒 Host Admin Authorization</h3>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
              Enter Host PIN to return to full admin controls (Default PIN: 1234)
            </p>
            <form onSubmit={handlePinSubmit}>
              <input
                type="password"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter PIN..."
                style={{
                  ...styles.pinInput,
                  borderColor: pinError ? 'var(--offline)' : 'var(--border2)',
                }}
                className="mono"
                autoFocus
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="button" onClick={() => setPinModal(false)} style={{ flex: 1 }} className="btn-touch btn-secondary">
                  Cancel
                </button>
                <button type="submit" style={{ flex: 1 }} className="btn-touch btn-accent">
                  Unlock
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { padding: '12px 0 40px', maxWidth: 640, margin: '0 auto' },
  topBanner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  badge: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 4 },
  title: { fontSize: 24, fontWeight: 800 },
  adminBtn: { fontSize: 12, padding: '6px 12px' },
  orbRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, marginBottom: 20 },
  orbCard: { padding: '16px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  orb: { width: 44, height: 44, borderRadius: '50%', marginBottom: 8, transition: 'all 0.3s ease' },
  orbLabel: { fontSize: 12, fontWeight: 600 },
  orbSub: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  bpmCard: { padding: 20, marginBottom: 24 },
  bpmHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  bpmSub: { fontSize: 10, color: 'var(--text3)', letterSpacing: '0.1em', fontWeight: 700 },
  bpmNum: { fontSize: 32, fontWeight: 800, color: 'var(--accent)' },
  bpmDot: { width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)' },
  tapBtn: { width: '100%', height: 56, fontSize: 16, borderRadius: 'var(--radius)' },
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text2)', marginBottom: 12 },
  sceneGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 },
  sceneCard: { height: 70, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderRadius: 'var(--radius)', color: '#ffffff' },
  sceneIcon: { fontSize: 24 },
  sceneName: { fontSize: 15, fontWeight: 700 },
  paletteRow: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 },
  paletteChip: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border2)' },
  colorDot: { width: 12, height: 12, borderRadius: '50%' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 360, padding: 24 },
  pinInput: { width: '100%', height: 48, background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', color: 'var(--text)' }
};
