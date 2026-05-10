# 🌕 LUMA — Home Light Controller

Control your 3 Havells smart bulbs with scenes, schedules, and song choreography.

## Setup

```bash
# Install all dependencies
npm run install:all

# Start both server + UI
npm run dev
```

Server runs at http://localhost:3001  
UI runs at http://localhost:5173

## Your Bulbs

| Room           | IP             | Device ID                  |
|---------------|----------------|----------------------------|
| Bedroom        | 192.168.1.5   | d7e7212acc0425c719jhzh     |
| Hall           | 192.168.1.16  | d779f624e271236eeeiogr     |
| Washing Machine| 192.168.1.4   | d75d679deb6e48e3c6ylwa     |

## Scenes

- **Focus** — full bright cool white everywhere
- **Relax** — warm dim, all rooms
- **Bedtime** — bedroom only, warm low
- **Sleep** — slow 30-min fade to off
- **Night Walk** — hall + WM dim, bedroom off
- **Morning** — bedroom ramps up over 20 mins, hall follows
- **Movie** — very dim warm everywhere
- **Party** — RGB colour cycle all bulbs
- **Off** — everything off

## Song Choreography

Add songs to `songs/` as JSON files. Play the track in Spotify,
hit Play in the UI simultaneously to sync the lights.

## Adding New Songs

```json
{
  "title": "Song Name",
  "artist": "Artist",
  "duration": 214,
  "cues": [
    { "time": 0, "label": "intro", "bulbs": ["bedroom"], "brightness": 100, "colorTemp": 200 },
    { "time": 32, "label": "drop", "bulbs": ["bedroom","hall","washingmachine"], "brightness": 1000 }
  ]
}
```
