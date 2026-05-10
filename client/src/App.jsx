import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from './socket';
import RoomCard   from './components/RoomCard';
import ScenePanel from './components/ScenePanel';
import SongPlayer from './components/SongPlayer';
import BpmEngine  from './components/BpmEngine';

export default function App() {
  const [bulbs,       setBulbList]    = useState([]);
  const [state,       setState]       = useState({});
  const [connected,   setConnected]   = useState(false);
  const [activeScene, setActiveScene] = useState(null);
  const [activeTab,   setActiveTab]   = useState('rooms');
  const [sleepProg,   setSleepProg]   = useState(null);

  useEffect(() => {
    socket.on('connect',      () => setConnected(true));
    socket.on('disconnect',   () => setConnected(false));
    socket.on('bulbs:list',   (list) => setBulbList(list));
    socket.on('state:update', s  => setState(s));
    socket.on('scene:active', ({ name }) => setActiveScene(name));
    socket.on('sleep:progress', ({ brightness, total }) =>
      setSleepProg(Math.round((1 - brightness / total) * 100)));
    socket.on('scene:complete', ({ scene }) => {
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

  const tabs = [
    { id: 'rooms',  label: 'Rooms'  },
    { id: 'scenes', label: 'Scenes' },
    { id: 'bpm',    label: 'BPM'    },
    { id: 'music',  label: 'Music'  },
  ];

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.wordmark}>
          <span style={styles.logo}>🌕</span>
          <span style={styles.logoText}>LUMA</span>
        </div>
        <div style={styles.headerRight}>
          {sleepProg !== null && (
            <motion.div initial={{ opacity:0, x:10 }} animate={{ opacity:1, x:0 }} style={styles.sleepBadge}>
              😴 Sleep {sleepProg}%
            </motion.div>
          )}
          <div style={{ ...styles.dot, background: connected ? 'var(--online)' : 'var(--offline)' }} />
          <span style={styles.connLabel}>{connected ? 'Connected' : 'Offline'}</span>
        </div>
      </header>

      <div style={styles.zoneRow}>
        <span style={styles.zoneTag}>⟠ Entry zone overlap: Hall + WM</span>
      </div>

      <div style={styles.tabs}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ ...styles.tab, ...(activeTab === t.id ? styles.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      <main style={styles.main}>
        <AnimatePresence mode="wait">
          {activeTab === 'rooms' && (
            <motion.div key="rooms" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} style={styles.roomGrid}>
              {bulbs.map((b) => (
                <RoomCard key={b.id} id={b.id}
                  meta={{ label: b.name, icon: b.icon, protocol: b.protocol }}
                  state={state[b.id] || {}}
                  onChange={(params) => setBulb(b.id, params)} />
              ))}
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
        </AnimatePresence>
      </main>
    </div>
  );
}

const styles = {
  app:        { minHeight:'100vh', display:'flex', flexDirection:'column', maxWidth:960, margin:'0 auto', padding:'0 20px' },
  header:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'28px 0 20px', borderBottom:'1px solid var(--border)' },
  wordmark:   { display:'flex', alignItems:'center', gap:10 },
  logo:       { fontSize:22 },
  logoText:   { fontSize:22, fontWeight:800, letterSpacing:'0.12em', color:'var(--accent)' },
  headerRight:{ display:'flex', alignItems:'center', gap:10 },
  dot:        { width:7, height:7, borderRadius:'50%' },
  connLabel:  { fontSize:12, color:'var(--text2)', fontFamily:"'DM Mono',monospace" },
  sleepBadge: { fontSize:11, padding:'4px 10px', borderRadius:20, background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--accent)', fontFamily:"'DM Mono',monospace" },
  zoneRow:    { padding:'12px 0 0' },
  zoneTag:    { fontSize:11, color:'var(--text3)', fontFamily:"'DM Mono',monospace", letterSpacing:'0.05em' },
  tabs:       { display:'flex', gap:4, padding:'20px 0 0', borderBottom:'1px solid var(--border)', marginBottom:28 },
  tab:        { padding:'8px 20px', borderRadius:'var(--radius-sm) var(--radius-sm) 0 0', background:'transparent', color:'var(--text2)', fontSize:13, fontWeight:600, letterSpacing:'0.04em', transition:'all 0.15s', borderBottom:'2px solid transparent', marginBottom:-1, cursor:'pointer' },
  tabActive:  { color:'var(--accent)', borderBottom:'2px solid var(--accent)' },
  main:       { flex:1, paddingBottom:60 },
  roomGrid:   { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 },
};
