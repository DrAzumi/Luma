import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import socket from '../socket';

export default function SongPlayer() {
  const [songs,    setSongs]    = useState([]);
  const [status,   setStatus]   = useState({ isPlaying: false, elapsed: 0, duration: 0 });
  const [selected, setSelected] = useState(null);
  const [cueLog,   setCueLog]   = useState([]);

  useEffect(() => {
    fetch('/api/songs').then(r => r.json()).then(data => {
      setSongs(data);
      if (data.length) setSelected(data[0].id);
    }).catch(() => {});

    socket.on('song:progress', ({ elapsed, duration }) =>
      setStatus(s => ({ ...s, elapsed, duration: duration || s.duration })));
    socket.on('song:started',  ({ duration }) =>
      setStatus(s => ({ ...s, isPlaying: true, elapsed: 0, duration })));
    socket.on('song:stopped',  () =>
      setStatus(s => ({ ...s, isPlaying: false, elapsed: 0 })));
    socket.on('song:cue', cue =>
      setCueLog(prev => [cue, ...prev].slice(0, 8)));

    return () => {
      socket.off('song:progress');
      socket.off('song:started');
      socket.off('song:stopped');
      socket.off('song:cue');
    };
  }, []);

  const play = () => selected && socket.emit('song:play', { song: selected, offset: 0 });
  const stop = () => socket.emit('song:stop');

  const song     = songs.find(s => s.id === selected);
  const duration = status.duration || song?.duration || 1;
  const progress = Math.min((status.elapsed / duration) * 100, 100);

  const fmt = s => `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;

  return (
    <div style={styles.wrap}>
      <p style={styles.hint}>
        Start the song in Spotify, then hit ▶ Play simultaneously to sync the lights.
        Cues are pre-mapped to the track's structure.
      </p>

      <div style={styles.songList}>
        {songs.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)} style={{
            ...styles.songRow,
            borderColor: selected === s.id ? 'var(--accent)' : 'var(--border)',
            background:  selected === s.id ? '#f5c84212' : 'var(--surface)',
          }}>
            <div style={styles.songIcon}>♫</div>
            <div style={styles.songMeta}>
              <div style={styles.songTitle}>{s.title}</div>
              <div style={styles.songArtist}>{s.artist}</div>
            </div>
            <span style={styles.dur}>{fmt(s.duration)}</span>
          </button>
        ))}
      </div>

      {song && (
        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} style={styles.player}>
          <div style={styles.playerTop}>
            <div>
              <div style={styles.playerTitle}>{song.title}</div>
              <div style={styles.playerArtist}>{song.artist}</div>
            </div>
            {status.isPlaying
              ? <button onClick={stop} style={styles.stopBtn}>■ Stop</button>
              : <button onClick={play} style={styles.playBtn}>▶ Play</button>
            }
          </div>

          <div style={styles.progressWrap}>
            <div style={styles.progressBg}>
              <motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} style={styles.progressFill} />
            </div>
            <div style={styles.timeRow}>
              <span style={styles.timeText}>{fmt(status.elapsed)}</span>
              <span style={styles.timeText}>{fmt(duration)}</span>
            </div>
          </div>

          {status.isPlaying && cueLog.length > 0 && (
            <div style={styles.cueLog}>
              <div style={styles.cueHeader}>LIVE CUES</div>
              {cueLog.map((c, i) => (
                <motion.div key={i} initial={{ opacity:0, x:-6 }} animate={{ opacity: 1 - i*0.12, x:0 }}
                  style={{ ...styles.cueRow, opacity: Math.max(0.1, 1 - i * 0.12) }}>
                  <span style={styles.cueTime}>{fmt((c.elapsed||0)/1000)}</span>
                  <span style={styles.cueLabel}>{c.label}</span>
                </motion.div>
              ))}
            </div>
          )}

          {!status.isPlaying && (
            <div style={styles.syncNote}>
              ↑ Play the track first, then hit ▶ to sync
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

const styles = {
  wrap:         { display:'flex', flexDirection:'column', gap:20 },
  hint:         { fontSize:12, color:'var(--text3)', fontFamily:"'DM Mono',monospace", lineHeight:1.7 },
  songList:     { display:'flex', flexDirection:'column', gap:8 },
  songRow: {
    display:'flex', alignItems:'center', gap:14,
    padding:'12px 16px', borderRadius:'var(--radius)',
    border:'1px solid var(--border)', cursor:'pointer', textAlign:'left',
    transition:'all 0.15s',
  },
  songIcon:   { fontSize:18, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--surface2)', borderRadius:8, color:'var(--accent)' },
  songMeta:   { flex:1 },
  songTitle:  { fontSize:14, fontWeight:600 },
  songArtist: { fontSize:11, color:'var(--text2)', fontFamily:"'DM Mono',monospace", marginTop:2 },
  dur:        { fontSize:11, color:'var(--text3)', fontFamily:"'DM Mono',monospace" },
  player: {
    background:'var(--surface)', border:'1px solid var(--border2)',
    borderRadius:'var(--radius)', padding:20,
    display:'flex', flexDirection:'column', gap:16,
  },
  playerTop:   { display:'flex', justifyContent:'space-between', alignItems:'center' },
  playerTitle: { fontSize:15, fontWeight:700 },
  playerArtist:{ fontSize:12, color:'var(--text2)', fontFamily:"'DM Mono',monospace", marginTop:3 },
  playBtn: {
    padding:'8px 18px', borderRadius:8,
    background:'var(--accent)', color:'#0a0a0b',
    fontSize:13, fontWeight:700, cursor:'pointer',
  },
  stopBtn: {
    padding:'8px 18px', borderRadius:8,
    background:'var(--surface2)', color:'var(--offline)',
    border:'1px solid var(--offline)', fontSize:13, fontWeight:700, cursor:'pointer',
  },
  progressWrap: { display:'flex', flexDirection:'column', gap:6 },
  progressBg:   { height:3, borderRadius:2, background:'var(--border2)', overflow:'hidden' },
  progressFill: { height:'100%', background:'var(--accent)', borderRadius:2 },
  timeRow:      { display:'flex', justifyContent:'space-between' },
  timeText:     { fontSize:10, color:'var(--text3)', fontFamily:"'DM Mono',monospace" },
  cueLog:       { display:'flex', flexDirection:'column', gap:4 },
  cueHeader:    { fontSize:10, color:'var(--text3)', fontFamily:"'DM Mono',monospace", letterSpacing:'0.1em', marginBottom:4 },
  cueRow:       { display:'flex', gap:12, alignItems:'center' },
  cueTime:      { fontSize:10, color:'var(--accent)', fontFamily:"'DM Mono',monospace", minWidth:36 },
  cueLabel:     { fontSize:11, color:'var(--text2)', fontFamily:"'DM Mono',monospace" },
  syncNote:     { fontSize:11, color:'var(--text3)', fontFamily:"'DM Mono',monospace", textAlign:'center', padding:'8px 0' },
};
