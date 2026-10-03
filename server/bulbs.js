// LUMA — Bulb Manager (Tuya Cloud API + WiZ LAN + Demo Mode Simulation)
const crypto = require("crypto");
const store = require("./config-store");
const { lanSet } = require("./lanDaemon");

const API_KEY = "gg8tc9putk7ccxkgq7j5";
const API_SECRET = "f5a249c732dd42f3a5e685295844756f";
const BASE_URL = "https://openapi.tuyain.com";

const state = {};
let demoMode = true; // Demo sandbox enabled by default for seamless onboarding

function getBulbs() {
  return store.getBulbs();
}

function initState() {
  const bulbs = getBulbs();
  bulbs.forEach((b) => {
    if (!state[b.id]) {
      state[b.id] = {
        power: true,
        brightness: 750,
        colorTemp: 500,
        mode: "white",
        color: { h: 220, s: 800, v: 900 },
        online: true,
      };
    }
  });
  const ids = new Set(bulbs.map((b) => b.id));
  Object.keys(state).forEach((id) => {
    if (!ids.has(id)) delete state[id];
  });
}

initState();

function addBulbState(id) {
  if (!state[id]) {
    state[id] = {
      power: true,
      brightness: 750,
      colorTemp: 500,
      mode: "white",
      color: null,
      online: true,
    };
  }
}

function removeBulbState(id) {
  delete state[id];
}

let accessToken = null;
let tokenExpiry = 0;
let _tokenFetch = null;
let _cloudUnavailable = false;
let pollPaused = false;

function isDemoMode() {
  return demoMode;
}

function setDemoMode(val, io) {
  demoMode = !!val;
  Object.keys(state).forEach(id => {
    state[id].online = true;
  });
  if (io) {
    io.emit("demo:status", { demoMode });
    io.emit("state:update", state);
  }
  console.log(`[LUMA] Demo Mode set to: ${demoMode}`);
  return demoMode;
}

function getState() {
  return state;
}

function pausePolling() {
  pollPaused = true;
}

function resumePolling() {
  pollPaused = false;
}

function sign(method, path, body, timestamp, token) {
  const contentHash = crypto.createHash("sha256").update(body || "").digest("hex");
  const stringToSign = [method, contentHash, "", path].join("\n");
  const signStr = API_KEY + (token || "") + timestamp + stringToSign;
  return crypto.createHmac("sha256", API_SECRET).update(signStr).digest("hex").toUpperCase();
}

async function request(method, path, body = null) {
  const timestamp = Date.now().toString();
  const token = accessToken || "";
  const bodyStr = body ? JSON.stringify(body) : "";
  const signature = sign(method, path, bodyStr, timestamp, token);
  const headers = {
    client_id: API_KEY,
    access_token: token,
    t: timestamp,
    sign: signature,
    sign_method: "HMAC-SHA256",
    "Content-Type": "application/json",
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr || undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`Tuya API: ${json.msg}`);
  return json.result;
}

async function getToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  if (!_tokenFetch) {
    _tokenFetch = (async () => {
      const timestamp = Date.now().toString();
      const path = "/v1.0/token?grant_type=1";
      const signature = sign("GET", path, "", timestamp, "");
      const headers = {
        client_id: API_KEY,
        t: timestamp,
        sign: signature,
        sign_method: "HMAC-SHA256",
      };
      const res = await fetch(`${BASE_URL}${path}`, { method: "GET", headers });
      const json = await res.json();
      if (!json.success) throw new Error(`Auth failed: ${json.msg}`);
      accessToken = json.result.access_token;
      tokenExpiry = Date.now() + json.result.expire_time * 1000 - 60000;
      return accessToken;
    })().finally(() => { _tokenFetch = null; });
  }
  return _tokenFetch;
}

async function syncDeviceStatus(bulb) {
  if (state[bulb.id]) state[bulb.id].online = true;
  if (bulb.protocol === "wiz" || !bulb.deviceId) return;
  if (demoMode || _cloudUnavailable || pollPaused) return;

  try {
    await getToken();
    const result = await request("GET", `/v1.0/devices/${bulb.deviceId}/status`);
    const dps = {};
    result.forEach((item) => { dps[item.code] = item.value; });
    if (dps.switch_led !== undefined) state[bulb.id].power = dps.switch_led;
    if (dps.bright_value_v2 !== undefined) state[bulb.id].brightness = dps.bright_value_v2;
    if (dps.temp_value_v2 !== undefined) state[bulb.id].colorTemp = dps.temp_value_v2;
    if (dps.work_mode !== undefined) state[bulb.id].mode = dps.work_mode;
    state[bulb.id].online = true;
  } catch (e) {
    if (/No permissions|expired/.test(e.message)) {
      _cloudUnavailable = true;
    }
    if (state[bulb.id]) state[bulb.id].online = true;
  }
}

async function initBulbs(io) {
  const bulbs = getBulbs();
  for (const bulb of bulbs) {
    await syncDeviceStatus(bulb);
  }
  if (io) io.emit("state:update", state);
  setInterval(async () => {
    if (pollPaused || demoMode) return;
    const currentBulbs = getBulbs();
    for (const bulb of currentBulbs) {
      await syncDeviceStatus(bulb);
    }
    if (io) io.emit("state:update", state);
  }, 15000);
}

async function setBulb(id, params, io) {
  let bulbState = state[id];
  if (!bulbState) {
    addBulbState(id);
    bulbState = state[id];
  }

  // Apply state parameters optimistically
  if (params.power !== undefined) bulbState.power = params.power;
  if (params.brightness !== undefined) bulbState.brightness = params.brightness;
  if (params.colorTemp !== undefined) bulbState.colorTemp = params.colorTemp;
  if (params.color !== undefined) {
    bulbState.color = params.color;
    bulbState.mode = "colour";
  } else if (params.colorTemp !== undefined || params.brightness !== undefined) {
    bulbState.mode = "white";
  }

  // Broadcast state immediately
  if (io) io.emit("state:update", state);

  // Trigger LAN control asynchronously regardless of cloud mode
  try {
    lanSet(id, params);
  } catch (e) {
    console.log(`[Bulbs] LAN set failed for ${id}: ${e.message}`);
  }

  return bulbState;
}

async function setAll(params, io) {
  const bulbs = getBulbs();
  const promises = bulbs.map(b => setBulb(b.id, params, io));
  await Promise.all(promises);
}

module.exports = {
  initBulbs,
  setBulb,
  setAll,
  getState,
  getBulbs,
  pausePolling,
  resumePolling,
  addBulbState,
  removeBulbState,
  isDemoMode,
  setDemoMode,
  getToken,
  request,
};
