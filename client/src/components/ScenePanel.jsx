import React from 'react';
import { motion } from 'framer-motion';

const SCENES = [
  { id: 'focus',     label: 'Focus',       icon: '⚡', desc: 'Full bright cool white',         color: '#6eb5ff' },
  { id: 'relax',     label: 'Relax',       icon: '☕', desc: 'Warm dim, all rooms',             color: '#ffb347' },
  { id: 'bedtime',   label: 'Bedtime',     icon: '🌙', desc: 'Bedroom only, warm low',          color: '#a78bfa' },
  { id: 'sleep',     label: 'Sleep',       icon: '😴', desc: 'Slow 30-min fade to off',         color: '#7c6ff5' },
  { id: 'nightwalk', label: 'Night Walk',  icon: '👣', desc: 'Hall + WM dim, bedroom off',      color: '#3ddc84' },
  { id: 'morning',   label: 'Morning',     icon: '🌅', desc: 'Bedroom ramps up, hall follows',  color: '#f5c842' },
  { id: 'movie',     label: 'Movie',       icon: '🎬', desc: 'Very dim warm everywhere',        color: '#e8843a' },
  { id: 'party',     label: 'Party',       icon: '🎉', desc: 'RGB colour cycle all bulbs',      color: '#ff6b9d' },
  { id: 'off',       label: 'All Off',     icon: '○',  desc: 'Everything off',                  color: '#44445a' },
];

export default function ScenePanel({ activeScene, onScene }) {
  return (
    <div>
      <p style={styles.hint}>Tap a scene to activate across all bulbs instantly.</p>
      <div style={styles.grid}>
        {SCENES.map((scene, i) => (
          <motion.button
            key={scene.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onScene(scene.id)}
            style={{
              ...styles.sceneCard,
              borderColor: activeScene === scene.id ? scene.color : 'var(--border)',
              background: activeScene === scene.id
                ? `${scene.color}12`
                : 'var(--surface)',
            }}
          >
            <div style={{ ...styles.sceneIconWrap, background: `${scene.color}20` }}>
              <span style={styles.sceneIcon}>{scene.icon}</span>
            </div>
            <div style={styles.sceneInfo}>
              <div style={{
                ...styles.sceneName,
                color: activeScene === scene.id ? scene.color : 'var(--text)',
              }}>
                {scene.label}
              </div>
              <div style={styles.sceneDesc}>{scene.desc}</div>
            </div>
            {activeScene === scene.id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{ ...styles.activePip, background: scene.color }}
              />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  hint: {
    fontSize: 12,
    color: 'var(--text3)',
    fontFamily: "'DM Mono', monospace",
    marginBottom: 20,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 12,
  },
  sceneCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    textAlign: 'left',
    transition: 'border-color 0.2s, background 0.2s',
    position: 'relative',
    cursor: 'pointer',
  },
  sceneIconWrap: {
    width: 44, height: 44,
    borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sceneIcon: { fontSize: 20 },
  sceneInfo: { flex: 1 },
  sceneName: { fontSize: 14, fontWeight: 600, marginBottom: 3 },
  sceneDesc: { fontSize: 11, color: 'var(--text2)', fontFamily: "'DM Mono', monospace" },
  activePip: {
    position: 'absolute',
    top: 10, right: 10,
    width: 6, height: 6,
    borderRadius: '50%',
  },
};
