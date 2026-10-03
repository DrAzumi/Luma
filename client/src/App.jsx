import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from './socket';
import RoomCard   from './components/RoomCard';
import ScenePanel from './components/ScenePanel';
import SongPlayer from './components/SongPlayer';
import BpmEngine  from './components/BpmEngine';
import DevicesPanel from './components/DevicesPanel';
import RoomLayout from './components/RoomLayout';
import GuestVjView from './components/GuestVjView';

export default function App() {
  const [bulbs,       setBulbList]    = useState([]);
  const [state,       setState]       = useState({});
  const [connected,   setConnected]   = useState(false);
  const [demoMode,    setDemoMode]    = useState(true);
  const [properties,  setProperties]  = useState([]);
  const [activeProp,  setActiveProp]  = useState(null);
  const [activeScene, setActiveScene] = useState(null);
  const [activeTab,   setActiveTab]   = useState('rooms');
  const [sleepProg,   setSleepProg]   = useState(null);
  const [guestMode,   setGuestMode]   = useState(false);

  useEffect(() => {
    socket.on('connect',            () => setConnected(true));
    socket.on('disconnect',         () => setConnected(false));
    socket.on('bulbs:list',         (list) => setBulbList(list));
    socket.on('state:update',       s => setState(s));
    socket.on('demo:status',        ({ demoMode }) => setDemoMode(demoMode));
    socket.on('properties:update',  ({ properties, active }) => {
      setProperties(properties || []);
      setActiveProp(active || null);
    });
    socket.on('scene:active',       ({ name }) => setActiveScene(name));
    socket.on('sleep:progress',     ({ brightness, total }) =>
      setSleepProg(Math.round((1 - brightness / total) * 100)));
    socket.on('scene:complete',     ({ scene }) => {
      if (scene === 'sleep') setSleepProg(null);
    });
    return () => socket.removeAllListeners();
  }, []);

  const setBulb  = useCallback((id, params) => socket.emit('bulb:set', { id, params }), []);
  const runScene = useCallback((name) => {
    socket.emit('scene:run', { name });
    setActiveScene(name);
    setSleepProg(null);
  }, []);

  const toggleDemo = useCallback(() => {
    socket.emit('demo:toggle', { enabled: !demoMode });
  }, [demoMode]);

  const selectProperty = useCallback((id) => {
    socket.emit('property:set', { id });
  }, []);

  const tabs = [
    { id: 'rooms',  label: 'Rooms',  icon: '💡' },
    { id: 'layout', label: 'Layout', icon: '🏠' },
    { id: 'scenes', label: 'Scenes', icon: '✨' },
    { id: 'bpm',    label: 'BPM',    icon: '♩'  },
    { id: 'music',  label: 'Music',  icon: '🎵' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  if (guestMode) {
    return (
      <div className="app-wrap" style={styles.app}>
        <GuestVjView
          state={state}
          bulbs={bulbs}
          onRunScene={runScene}
          onSetBpm={(bpm) => socket.emit('bpm:start', { bpm })}
          onExitGuestMode={() => setGuestMode(false)}
        />
      </div>
    );
  }

  return (
    <div className="app-wrap" style={styles.app}>
      <header className="app-header" style={styles.header}>
        <div style={styles.leftBar}>
          <div style={styles.wordmark}>
            <span style={styles.logo}>🌕</span>
            <span className="gradient-text" style={styles.logoText}>LUMA</span>
          </div>

          {/* Property Selector */}
          {properties.length > 0 && (
            <select
              value={activeProp?.id || ''}
              onChange={(e) => selectProperty(e.target.value)}
              style={styles.propSelect}
              className="glass-pill mono"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id} style={{ background: '#121218', color: '#fff' }}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={styles.headerRight}>
          {/* Demo Sandbox Badge */}
          <button
            onClick={toggleDemo}
            style={{
              ...styles.demoBadge,
              borderColor: demoMode ? 'var(--demo)' : 'var(--border2)',
              color: demoMode ? 'var(--demo)' : 'var(--text3)',
            }}
            title="Click to toggle simulation demo sandbox"
            className="mono btn-touch"
          >
            {demoMode ? '👾 SANDBOX DEMO' : '⚡️ LIVE HARDWARE'}
          </button>

          {/* Guest VJ Mode Button */}
          <button
            onClick={() => setGuestMode(true)}
            style={styles.vjBtn}
            className="glass-pill btn-touch mono"
            title="Switch to Guest VJ Mode for party attendees"
          >
            🎉 VJ VIEW
          </button>

          {sleepProg !== null && (
            <motion.div initial={{ opacity:0, x:10 }} animate={{ opacity:1, x:0 }} style={styles.sleepBadge}>
              😴 Sleep {sleepProg}%
            </motion.div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                ...styles.dot,
                background: connected ? 'var(--online)' : 'var(--offline)',
                boxShadow: connected ? '0 0 10px rgba(61, 220, 132, 0.6)' : 'none',
              }}
            />
            <span style={styles.connLabel}>{connected ? 'Connected' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab-item ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Main View */}
      <main className="main-content" style={styles.main}>
        <AnimatePresence mode="wait">
          {activeTab === 'rooms' && (
            <motion.div key="rooms" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="room-grid" style={styles.roomGrid}>
              {bulbs.map((b) => (
                <RoomCard
                  key={b.id}
                  id={b.id}
                  meta={{ label: b.name, icon: b.icon, protocol: b.protocol }}
                  state={state[b.id] || {}}
                  onChange={(params) => setBulb(b.id, params)}
                />
              ))}
            </motion.div>
          )}
          {activeTab === 'layout' && (
            <motion.div key="layout" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
              <RoomLayout />
            </motion.div>
          )}
          {activeTab === 'scenes' && (
            <motion.div key="scenes" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
              <ScenePanel activeScene={activeScene} onScene={runScene} />
            </motion.div>
          )}
          {activeTab === 'bpm' && (
            <motion.div key="bpm" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
              <BpmEngine />
            </motion.div>
          )}
          {activeTab === 'music' && (
            <motion.div key="music" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
              <SongPlayer />
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
              <DevicesPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

const styles = {
  app: { minHeight: '100vh', display: 'flex', flexDirection: 'column', maxWidth: 1040, margin: '0 auto', padding: '0 20px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 0 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 },
  leftBar: { display: 'flex', alignItems: 'center', gap: 16 },
  wordmark: { display: 'flex', alignItems: 'center', gap: 8 },
  logo: { fontSize: 24 },
  logoText: { fontSize: 24, fontWeight: 800, letterSpacing: '0.12em' },
  propSelect: { padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none', cursor: 'pointer' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  demoBadge: { padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 'var(--radius-full)', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid var(--border2)' },
  vjBtn: { padding: '6px 14px', fontSize: 11, fontWeight: 700, color: 'var(--accent)' },
  dot: { width: 8, height: 8, borderRadius: '50%' },
  connLabel: { fontSize: 11, color: 'var(--text2)', fontFamily: "'DM Mono', monospace" },
  sleepBadge: { fontSize: 11, padding: '4px 10px', borderRadius: 20, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--accent)', fontFamily: "'DM Mono', monospace" },
  main: { flex: 1, paddingBottom: 60 },
  roomGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
};
