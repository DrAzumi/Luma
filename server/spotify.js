// LUMA — Spotify Integration with token persistence

const https = require("https");
const fs = require("fs");
const path = require("path");

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";
const REDIRECT_URI = "http://127.0.0.1:3001/spotify/callback";
const SCOPES = "user-read-currently-playing user-read-playback-state";
const TOKEN_FILE = path.join(__dirname, "..", ".spotify-tokens.json");

let tokens = { access_token: null, refresh_token: null, expires_at: 0 };

// Load saved tokens on startup
function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
      console.log("[Spotify] Loaded saved tokens");
    }
  } catch (e) {}
}

function saveTokens() {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));
  } catch (e) {}
}

loadTokens();

function getAuthUrl() {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
  });
  return `https://accounts.spotify.com/authorize?${p}`;
}

async function fetchToken(body) {
  const auth = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");
  return spotifyPost("https://accounts.spotify.com/api/token", body, {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/x-www-form-urlencoded",
  });
}

async function exchangeCode(code) {
  const r = await fetchToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  );
  tokens.access_token = r.access_token;
  tokens.refresh_token = r.refresh_token;
  tokens.expires_at = Date.now() + r.expires_in * 1000 - 60000;
  saveTokens();
}

async function refreshToken() {
  if (!tokens.refresh_token) throw new Error("No refresh token");
  const r = await fetchToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }).toString(),
  );
  tokens.access_token = r.access_token;
  tokens.expires_at = Date.now() + r.expires_in * 1000 - 60000;
  saveTokens();
}

async function getAccessToken() {
  if (!tokens.access_token) throw new Error("Not authenticated");
  if (Date.now() > tokens.expires_at) await refreshToken();
  return tokens.access_token;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode === 204) return resolve(null);
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Parse: ${data.slice(0, 80)}`)); }
      });
    }).on("error", reject);
  });
}

async function getDeezerBpm(trackName, artist) {
  const primaryArtist = artist.split(",")[0].trim();

  // Try progressively looser queries — Deezer BPM field is sparse, cast a wider net
  const queries = [
    `artist:"${primaryArtist}" track:"${trackName}"`,
    `"${trackName}" "${primaryArtist}"`,
    `${trackName} ${primaryArtist}`,
    trackName,
  ];

  for (const query of queries) {
    try {
      const search = await httpGet(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`,
      );
      const results = search?.data;
      if (!results?.length) {
        console.log(`[Deezer] no results for: ${query}`);
        continue;
      }

      // Check if any search result already has BPM
      const withBpm = results.find((t) => t.bpm > 0);
      if (withBpm) {
        console.log(`[Deezer] "${withBpm.title}" → ${withBpm.bpm} BPM (query: ${query})`);
        return Math.round(withBpm.bpm);
      }

      // BPM=0 in search results — fetch full track object for first match
      const full = await httpGet(`https://api.deezer.com/track/${results[0].id}`);
      if (full?.bpm > 0) {
        console.log(`[Deezer] full track "${full.title}" → ${full.bpm} BPM`);
        return Math.round(full.bpm);
      }
      console.log(`[Deezer] found "${results[0].title}" but bpm=0, trying next query`);
    } catch (e) {
      console.log(`[Deezer] query failed (${query}): ${e.message}`);
    }
  }

  console.log(`[Deezer] no BPM found for "${trackName}" — Deezer data may be sparse for this track`);
  return null;
}

function spotifyGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode === 204) return resolve(null);
          if (res.statusCode === 401) return reject(new Error("Unauthorized"));
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Parse: ${data.slice(0, 100)}`));
          }
        });
      })
      .on("error", reject);
  });
}

function spotifyPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: "POST",
        headers: { "Content-Length": Buffer.byteLength(body), ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Parse: ${data.slice(0, 100)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getNowPlaying() {
  const token = await getAccessToken();
  const data = await spotifyGet(
    "https://api.spotify.com/v1/me/player/currently-playing",
    { Authorization: `Bearer ${token}` },
  );
  if (!data?.item) return null;
  const t = data.item;
  return {
    id: t.id,
    name: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    albumArt: t.album.images[0]?.url || null,
    albumArtSm: t.album.images[2]?.url || null,
    isPlaying: data.is_playing,
    progress: data.progress_ms,
    duration: t.duration_ms,
  };
}

async function getAudioFeatures(trackId, trackName, artistName) {
  const token = await getAccessToken();

  // 1. Spotify audio-features (deprecated Nov 2024 — needs Extended Quota Mode)
  try {
    const data = await spotifyGet(
      `https://api.spotify.com/v1/audio-features/${trackId}`,
      { Authorization: `Bearer ${token}` },
    );
    if (data && !data.error && data.tempo) {
      return { bpm: Math.round(data.tempo), energy: data.energy, danceability: data.danceability, valence: data.valence, key: data.key, mode: data.mode };
    }
    if (data?.error) console.log(`[BPM] audio-features blocked (${data.error.status})`);
  } catch (e) {
    console.log(`[BPM] audio-features error: ${e.message}`);
  }

  // 2. Spotify audio-analysis fallback
  try {
    const analysis = await spotifyGet(
      `https://api.spotify.com/v1/audio-analysis/${trackId}`,
      { Authorization: `Bearer ${token}` },
    );
    if (analysis && !analysis.error && analysis.track?.tempo) {
      console.log(`[BPM] audio-analysis → ${Math.round(analysis.track.tempo)}`);
      return { bpm: Math.round(analysis.track.tempo), energy: null, danceability: null, valence: null, key: analysis.track.key ?? null, mode: analysis.track.mode ?? null };
    }
    if (analysis?.error) console.log(`[BPM] audio-analysis blocked (${analysis.error.status})`);
  } catch (e) {
    console.log(`[BPM] audio-analysis error: ${e.message}`);
  }

  // Fetch ISRC once — shared by steps 3 and 5
  let isrc = null;
  try {
    const trackMeta = await spotifyGet(
      `https://api.spotify.com/v1/tracks/${trackId}`,
      { Authorization: `Bearer ${token}` },
    );
    isrc = trackMeta?.external_ids?.isrc;
    if (!isrc) console.log(`[BPM] No ISRC in Spotify track metadata`);
  } catch (e) {
    console.log(`[BPM] ISRC fetch failed: ${e.message}`);
  }

  // 3. Deezer via ISRC — exact track match, more reliable than text search
  if (isrc) {
    try {
      const dz = await httpGet(`https://api.deezer.com/track/isrc:${isrc}`);
      if (dz?.bpm > 0) {
        console.log(`[BPM] Deezer ISRC ${isrc} → ${dz.bpm} for "${dz.title}"`);
        return { bpm: Math.round(dz.bpm), energy: null, danceability: null, valence: null, key: null, mode: null };
      }
      if (dz?.id) console.log(`[BPM] Deezer has track by ISRC but bpm=0`);
      else console.log(`[BPM] Deezer ISRC not found (regional gap or missing catalog)`);
    } catch (e) {
      console.log(`[BPM] Deezer ISRC lookup failed: ${e.message}`);
    }
  }

  // 4. Deezer text search
  if (trackName && artistName) {
    const bpm = await getDeezerBpm(trackName, artistName);
    if (bpm) return { bpm, energy: null, danceability: null, valence: null, key: null, mode: null };
  }

  // 5. MusicBrainz ISRC → AcousticBrainz low-level
  if (isrc) {
    try {
      console.log(`[BPM] Trying MusicBrainz for ISRC ${isrc}`);
      const mb = await spotifyGet(
        `https://musicbrainz.org/ws/2/recording?query=isrc:${isrc}&fmt=json`,
        { "User-Agent": "LUMA/1.0 (home lighting app)" },
      );
      const mbid = mb?.recordings?.[0]?.id;
      if (!mbid) {
        console.log(`[BPM] MusicBrainz: no recording found for ISRC ${isrc}`);
      } else {
        console.log(`[BPM] MusicBrainz MBID: ${mbid} — querying AcousticBrainz`);
        const ab = await httpGet(`https://acousticbrainz.org/api/v1/${mbid}/low-level`);
        const abBpm = ab?.rhythm?.bpm;
        if (abBpm > 0) {
          console.log(`[BPM] AcousticBrainz → ${Math.round(abBpm)} BPM`);
          return { bpm: Math.round(abBpm), energy: null, danceability: null, valence: null, key: null, mode: null };
        }
        console.log(`[BPM] AcousticBrainz: no BPM in response`);
      }
    } catch (e) {
      console.log(`[BPM] MusicBrainz/AcousticBrainz failed: ${e.message}`);
    }
  }

  console.log(`[BPM] All sources exhausted for "${trackName}". Fix: enable Extended Quota Mode at developer.spotify.com`);
  return null;
}

let pollInterval = null;
let lastTrackId = null;
let cachedTrack = null;
let cachedFeatures = null;

function startPolling(io, bpmEngine) {
  if (pollInterval) clearInterval(pollInterval);

  // Poll immediately on start
  doPoll(io, bpmEngine);

  pollInterval = setInterval(() => doPoll(io, bpmEngine), 8000);
}

async function doPoll(io, bpmEngine) {
  try {
    const track = await getNowPlaying();
    if (!track) return;
    cachedTrack = track;
    io.emit("spotify:nowplaying", track);

    if (track.id !== lastTrackId) {
      lastTrackId = track.id;
      const features = await getAudioFeatures(track.id, track.name, track.artist);
      if (features && features.bpm) {
        cachedFeatures = features;
        io.emit("spotify:features", features);
        console.log(`[Spotify] "${track.name}" — ${features.bpm} BPM`);
        if (bpmEngine.isRunning()) bpmEngine.update({ bpm: features.bpm }, io);
      } else {
        cachedFeatures = null;
        io.emit("spotify:no-features", {});
      }
    }
  } catch (e) {
    if (e.message === "Unauthorized") {
      try {
        await refreshToken();
      } catch (re) {
        console.log("[Spotify] Token refresh failed");
      }
    } else if (e.message !== "Not authenticated") {
      console.log("[Spotify] Poll error:", e.message);
    }
  }
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  lastTrackId = null;
  cachedTrack = null;
  cachedFeatures = null;
}

function getCachedState() {
  return { track: cachedTrack, features: cachedFeatures };
}

function isAuthenticated() {
  return !!tokens.access_token;
}

// Auto-start polling if we have saved tokens
function autoStart(io, bpmEngine) {
  if (isAuthenticated()) {
    console.log("[Spotify] Auto-starting polling from saved tokens");
    startPolling(io, bpmEngine);
  }
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getNowPlaying,
  getAudioFeatures,
  startPolling,
  stopPolling,
  getCachedState,
  isAuthenticated,
  autoStart,
  tokens,
};
