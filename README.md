# LUMA 🌕
**Smart home lighting — BPM sync, room scenes, and song choreography**

Control your smart bulbs with music. LUMA syncs your lights to the BPM of whatever you're playing on Spotify, lets you set scenes across rooms, and can run pre-choreographed light shows timed to specific songs.

Built for Tuya-based bulbs (Havells, Syska, Wipro, any Smart Life bulb) and Philips WiZ. Runs entirely on your local network — no subscription, no cloud dependency for control.

---

## What it does

**Rooms** — control each bulb individually. Brightness, warmth, full RGB colour picker.

**Scenes** — one-tap lighting modes across all bulbs simultaneously.
- Focus, Relax, Bedtime, Sleep (slow 30-min fade), Night Walk, Morning ramp, Movie, Party, Off

**BPM Sync** — lights pulse in time with your music.
- Connects to Spotify to auto-detect BPM of the current track
- 6 brightness effects: Thumper, Pulse, Breathe, Strobe, Chase, Ripple
- 12 colour palettes including album-inspired: Tame Impala Currents, The Slow Rush, IGOR, Blonde
- Tap tempo, editable BPM field, half-tempo tip
- Live album art colour extraction — use your album's colours as the palette
- All changes apply live without stopping

**Music** — pre-choreographed light shows timed to songs.
- Each bulb has a role (Lead, Counter, Pulse) and moves independently
- Horn stabs, drops, breakdowns, and buildups mapped to exact timestamps
- Comes with Beto's Horns (Fred again.. / CA7RIEL & Paco Amoroso) — 160 cues

---

## Supported bulbs

| Type | Examples | Protocol |
|------|----------|----------|
| Tuya / Smart Life | Havells, Syska, Wipro, Agaro, any bulb controllable from Smart Life app | LAN + Cloud |
| Philips WiZ | WiZ E27 RGB | LAN only |

If your bulb works with the **Smart Life app**, it's Tuya-compatible and will work with LUMA.

---

## Requirements

- **Node.js** 16 or higher
- **Python** 3.8 or higher
- Your bulbs connected to the same WiFi network as your laptop
- (Optional) Spotify account for BPM sync

---

## Setup

```bash
git clone https://github.com/DrAzumi/Luma.git
cd Luma
npm install
npm run setup
```

`npm run setup` is a guided wizard that:
1. Checks Node and Python are installed
2. Scans your network for smart bulbs
3. Lets you name each bulb by room
4. Fetches local keys for Tuya bulbs
5. Connects Spotify (optional)
6. Writes your config automatically

Takes about 5–10 minutes on first run.

---

## Run

```bash
npm run dev
```

Opens at **http://localhost:5173**

---

## Tuya bulb setup (extra step)

Tuya bulbs need a local encryption key that isn't visible in the Smart Life app. The setup wizard will guide you through this, but here's the overview:

1. Create a free account at [iot.tuya.com](https://iot.tuya.com)
2. Create a Cloud Project (Smart Home, India Data Center)
3. Subscribe to the free IoT Core trial
4. Link your Smart Life account via QR code
5. The wizard fetches your device keys automatically using your API credentials

This is a one-time step. Your keys are saved locally and the wizard handles it.

---

## Spotify BPM sync

1. Create a free app at [developer.spotify.com](https://developer.spotify.com)
2. Add redirect URI: `http://127.0.0.1:3001/spotify/callback`
3. Copy your Client ID and Secret into the setup wizard
4. Visit `http://localhost:3001/spotify/login` to connect your account

Once connected, LUMA auto-detects the BPM of whatever you're playing and syncs the lights. No need to reconnect after restarts — your session is saved.

---

## Adding songs

Drop a JSON file into the `songs/` folder:

```json
{
  "title": "Song Name",
  "artist": "Artist",
  "duration": 214,
  "bpm": 129,
  "cues": [
    { "time": 0,    "bulbs": ["bedroom","hall","washingmachine"], "power": false },
    { "time": 4,    "bulbs": ["hall"], "power": true, "brightness": 25, "colorTemp": 80 },
    { "time": 54,   "bulbs": ["bedroom"], "brightness": 800, "hue": 215, "saturation": 0.6, "value": 1.0 },
    { "time": 83.5, "bulbs": ["bedroom","hall","washingmachine"], "brightness": 1000, "colorTemp": 1000 }
  ]
}
```

Each cue fires at `time` seconds. Bulbs not listed in a cue are unaffected.

---

## Stack

- **Server**: Node.js + Express + Socket.io
- **Client**: React + Vite + Framer Motion
- **Bulb control**: tinytuya (Tuya LAN) + pywizlight (WiZ LAN) + Tuya Cloud API
- **Music**: Spotify Web API

---

## License

MIT
