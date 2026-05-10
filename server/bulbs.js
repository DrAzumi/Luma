// LUMA — Bulb Manager (Tuya Cloud API + WiZ LAN routing)
const crypto = require("crypto");
const { BULBS, DPS } = require("./config");
const { lanSet } = require("./lanDaemon");

const API_KEY = "4dqua8wtpggcmsahctge";
const API_SECRET = "c0312110810b4bdaa1ea5229ba54aa88";
const BASE_URL = "https://openapi.tuyain.com";

const state = {};
BULBS.forEach((b) => {
  state[b.id] = {
    power: false,
    brightness: 500,
    colorTemp: 500,
    mode: "white",
    color: null,
    online: false,
  };
});

let accessToken = null;
let tokenExpiry = 0;
let pollInterval = null;
let pollPaused = false;

function sign(method, path, body, timestamp, token) {
  const contentHash = crypto
    .createHash("sha256")
    .update(body || "")
    .digest("hex");
  const stringToSign = [method, contentHash, "", path].join("\n");
  const signStr = API_KEY + (token || "") + timestamp + stringToSign;
  return crypto
    .createHmac("sha256", API_SECRET)
    .update(signStr)
    .digest("hex")
    .toUpperCase();
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
  console.log("[LUMA] ✓ Authenticated");
  return accessToken;
}

async function syncDeviceStatus(bulb) {
  try {
    await getToken();
    const result = await request(
      "GET",
      `/v1.0/devices/${bulb.deviceId}/status`,
    );
    const dps = {};
    result.forEach((item) => {
      dps[item.code] = item.value;
    });
    if (dps.switch_led !== undefined) state[bulb.id].power = dps.switch_led;
    if (dps.bright_value_v2 !== undefined)
      state[bulb.id].brightness = dps.bright_value_v2;
    if (dps.temp_value_v2 !== undefined)
      state[bulb.id].colorTemp = dps.temp_value_v2;
    if (dps.work_mode !== undefined) state[bulb.id].mode = dps.work_mode;
    state[bulb.id].online = true;
  } catch (e) {
    state[bulb.id].online = false;
  }
}

async function initBulbs(io) {
  console.log("[LUMA] Connecting to Tuya Cloud...");
  try {
    await getToken();
    for (const bulb of BULBS) {
      if (bulb.protocol === "wiz") {
        state[bulb.id].online = true;
        console.log(`[LUMA] ✓ ${bulb.name} (WiZ, LAN only)`);
        continue;
      }
      await syncDeviceStatus(bulb);
      console.log(`[LUMA] ✓ ${bulb.name}`);
    }
    if (io) io.emit("state:update", state);

    pollInterval = setInterval(async () => {
      if (pollPaused) return;
      for (const bulb of BULBS) {
        if (bulb.protocol !== "wiz") await syncDeviceStatus(bulb);
      }
      if (io) io.emit("state:update", state);
    }, 30000);
  } catch (e) {
    console.log("[LUMA] Cloud init failed:", e.message);
  }
}

async function setBulb(bulbId, params, io) {
  const bulb = BULBS.find((b) => b.id === bulbId);

  // WiZ bulbs: LAN only, no cloud API
  if (bulb?.protocol === "wiz") {
    Object.assign(state[bulbId], params);
    if (io) io.emit("state:update", state);
    lanSet([bulbId], params);
    return;
  }

  // Don't send cloud commands when BPM is active — LAN is handling it
  if (pollPaused) {
    Object.assign(state[bulbId], params);
    return;
  }

  Object.assign(state[bulbId], params);
  if (io) io.emit("state:update", state);
  const commands = [];

  try {
    await getToken();
    if (params.power !== undefined)
      commands.push({ code: "switch_led", value: params.power });
    if (params.power === false) {
      if (commands.length)
        await request("POST", `/v1.0/devices/${bulb.deviceId}/commands`, {
          commands,
        });
      return;
    }
    if (params.color) {
      commands.push({ code: "work_mode", value: "colour" });
      commands.push({
        code: "colour_data_v2",
        value: {
          h: Math.round(params.color.h),
          s: Math.round(params.color.s),
          v: Math.round(params.color.v),
        },
      });
    } else {
      if (params.brightness !== undefined || params.colorTemp !== undefined)
        commands.push({ code: "work_mode", value: "white" });
      if (params.brightness !== undefined)
        commands.push({
          code: "bright_value_v2",
          value: Math.max(10, Math.min(1000, Math.round(params.brightness))),
        });
      if (params.colorTemp !== undefined)
        commands.push({
          code: "temp_value_v2",
          value: Math.max(0, Math.min(1000, Math.round(params.colorTemp))),
        });
    }
    if (commands.length)
      await request("POST", `/v1.0/devices/${bulb.deviceId}/commands`, {
        commands,
      });
  } catch (e) {
    // Only log if not a routine offline error during BPM
    if (!pollPaused)
      console.log(`[LUMA] setBulb error ${bulbId}: ${e.message}`);
    state[bulbId].online = false;
    if (io) io.emit("state:update", state);
  }
}

async function fadeBulb(bulbId, targetBrightness, durationMs, steps = 20) {
  const current = state[bulbId].brightness || 500;
  const diff = targetBrightness - current;
  const stepVal = diff / steps;
  const stepMs = durationMs / steps;
  for (let i = 1; i <= steps; i++) {
    await setBulb(bulbId, { brightness: Math.round(current + stepVal * i) });
    await sleep(stepMs);
  }
}

async function setAll(params, io) {
  await Promise.all(BULBS.map((b) => setBulb(b.id, params, io)));
}

// Called by BPM engine to pause cloud interference
function pausePolling() {
  pollPaused = true;
}
function resumePolling() {
  pollPaused = false;
}

function getState() {
  return state;
}
function getBulbs() {
  return BULBS;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  initBulbs,
  setBulb,
  fadeBulb,
  setAll,
  getState,
  getBulbs,
  sleep,
  pausePolling,
  resumePolling,
};
