#!/usr/bin/env python3
"""
LUMA LAN Daemon v5 — rate-limited per-bulb queues (Tuya + WiZ)
Prevents bulb lockup by dropping stale commands
and enforcing minimum gap between sends.

Config is loaded from ../bulbs-config.json (shared with Node.js server).
Supports {"reload": true} command to re-read config and add new bulbs.
"""
import sys, json, time, threading, asyncio, os
import tinytuya

try:
    from pywizlight import wizlight, PilotBuilder
    WIZ_AVAILABLE = True
except ImportError:
    WIZ_AVAILABLE = False
    sys.stderr.write("[LAN] pywizlight not found — WiZ bulbs disabled (pip install pywizlight)\n")
    sys.stderr.flush()

# Shared config file path (relative to this script)
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "bulbs-config.json")

# Minimum ms between commands per bulb — prevents lockup
MIN_GAP_MS = 200

# Shared state
BULBS_CFG     = {}  # tuya bulb id -> {id, key, ip}
WIZ_CFG       = {}  # wiz bulb id   -> {ip_address, mac_address}
devices       = {}
last_sent     = {}
pending       = {}
locks         = {}

# ── Auto-heal ────────────────────────────────────────────────────────────────
HEAL_THRESHOLD = 5
SCAN_COOLDOWN  = 45
_fail_counts   = {}
_wiz_fail      = {}
_quiet         = {}
_wiz_quiet     = {}
_last_scan     = 0.0
_scan_active   = False
_scan_lock     = threading.Lock()
_wiz_last_scan = 0.0
_wiz_scan_active = False
_wiz_scan_lock = threading.Lock()

# ── Config loading ───────────────────────────────────────────────────────────

def load_config():
    """Load bulb configs from bulbs-config.json.
    Returns (tuya_dict, wiz_dict) where each is id -> config."""
    tuya = {}
    wiz = {}
    try:
        with open(CONFIG_FILE, "r") as f:
            data = json.load(f)
        # Handle both old format (array) and new format ({bulbs: [...], groups: [...]})
        all_bulbs = data if isinstance(data, list) else data.get("bulbs", [])
        for b in all_bulbs:
            proto = b.get("protocol", "tuya")
            if proto == "tuya":
                tuya[b["id"]] = {
                    "id": b["deviceId"],
                    "key": b.get("localKey", ""),
                    "ip": b["ip"],
                    "version": float(b.get("version") or 3.5),
                }
            elif proto == "wiz":
                wiz[b["id"]] = {
                    "ip_address": b["ip"],
                    "mac_address": b.get("mac", ""),
                }
    except Exception as e:
        sys.stderr.write(f"[LAN] Config load error: {e}\n")
        sys.stderr.flush()
    return tuya, wiz

# ── Device connection ────────────────────────────────────────────────────────

def connect_bulb(name, cfg):
    d = tinytuya.BulbDevice(
        dev_id=cfg["id"],
        address=cfg["ip"],
        local_key=cfg["key"],
        version=cfg.get("version", 3.5),
    )
    d.set_socketTimeout(1.5)
    d.set_socketRetryLimit(1)
    d.status()
    sys.stderr.write(f"[LAN] connected {name}\n")
    sys.stderr.flush()
    return d

# ── Auto-heal ────────────────────────────────────────────────────────────────

def _tuya_heal_scan():
    global _last_scan, _scan_active
    with _scan_lock:
        if _scan_active:
            return
        if time.time() - _last_scan < SCAN_COOLDOWN:
            return
        _scan_active = True
        _last_scan = time.time()
    try:
        sys.stderr.write("[LAN] Auto-heal: scanning LAN for Tuya devices…\n")
        sys.stderr.flush()
        found = tinytuya.deviceScan(verbose=False, maxretry=3)
        id_to_ip = {(v.get("gwId") or v.get("id")): k for k, v in found.items()}
        for name, cfg in BULBS_CFG.items():
            new_ip = id_to_ip.get(cfg["id"])
            if not new_ip:
                continue
            changed = new_ip != cfg["ip"]
            if changed:
                sys.stderr.write(f"[LAN] Auto-heal: {name} IP {cfg['ip']} → {new_ip}\n")
                sys.stderr.flush()
                cfg["ip"] = new_ip
            d = tinytuya.BulbDevice(dev_id=cfg["id"], address=cfg["ip"],
                                     local_key=cfg["key"], version=cfg.get("version", 3.5))
            d.set_socketTimeout(1.5)
            d.set_socketRetryLimit(1)
            devices[name] = d
            _fail_counts[name] = 0
            _quiet[name] = False
            sys.stderr.write(f"[LAN] Auto-heal: {name} reconnected ({'new IP' if changed else 'same IP'})\n")
            sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[LAN] Auto-heal scan error: {e}\n")
        sys.stderr.flush()
    finally:
        _scan_active = False

def trigger_heal(name):
    _fail_counts[name] = _fail_counts.get(name, 0) + 1
    if _fail_counts[name] == HEAL_THRESHOLD:
        _quiet[name] = True
        sys.stderr.write(f"[LAN] {name} unreachable — suppressing errors, auto-heal scanning\n")
        sys.stderr.flush()
        threading.Thread(target=_tuya_heal_scan, daemon=True, name="tuya-heal").start()

# ── WiZ support ──────────────────────────────────────────────────────────────

def hsv_to_rgb(h, s, v):
    h, s, v = h / 360, s / 1000, v / 1000
    if s == 0:
        c = int(v * 255)
        return c, c, c
    i = int(h * 6)
    f = h * 6 - i
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    i = i % 6
    rgb = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return tuple(int(x * 255) for x in rgb)

wiz_loop = asyncio.new_event_loop()
wiz_pending = {}
wiz_locks = {}
wiz_last_sent = {}

def _start_wiz_loop():
    asyncio.set_event_loop(wiz_loop)
    wiz_loop.run_forever()

threading.Thread(target=_start_wiz_loop, daemon=True).start()

async def _wiz_discover():
    try:
        from pywizlight.discovery import find_wizlights
        import socket as _socket
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        broadcast = ".".join(local_ip.split(".")[:3]) + ".255"
        sys.stderr.write(f"[LAN] Auto-heal WiZ: scanning {broadcast}…\n")
        sys.stderr.flush()
        discovered = await find_wizlights(wait_time=6, broadcast_address=broadcast)
        mac_to_ip = {b.mac_address.replace(":", "").lower(): b.ip_address for b in discovered}
        for name, cfg in WIZ_CFG.items():
            mac = cfg.get("mac_address", "").replace(":", "").lower()
            new_ip = mac_to_ip.get(mac)
            if new_ip and new_ip != cfg["ip_address"]:
                sys.stderr.write(f"[LAN] Auto-heal WiZ: {name} {cfg['ip_address']} → {new_ip}\n")
                sys.stderr.flush()
                cfg["ip_address"] = new_ip
            if new_ip:
                _wiz_fail[name] = 0
                _wiz_quiet[name] = False
    except Exception as e:
        sys.stderr.write(f"[LAN] Auto-heal WiZ scan error: {e}\n")
        sys.stderr.flush()

def trigger_wiz_heal(name):
    global _wiz_last_scan, _wiz_scan_active
    _wiz_fail[name] = _wiz_fail.get(name, 0) + 1
    if _wiz_fail[name] == HEAL_THRESHOLD:
        _wiz_quiet[name] = True
        sys.stderr.write(f"[LAN/WiZ] {name} unreachable — suppressing errors, auto-heal scanning\n")
        sys.stderr.flush()
    if _wiz_fail[name] < HEAL_THRESHOLD:
        return
    with _wiz_scan_lock:
        if _wiz_scan_active:
            return
        if time.time() - _wiz_last_scan < SCAN_COOLDOWN:
            return
        _wiz_scan_active = True
        _wiz_last_scan = time.time()
    def _run():
        global _wiz_scan_active
        try:
            asyncio.run_coroutine_threadsafe(_wiz_discover(), wiz_loop).result(timeout=15)
        except Exception as e:
            sys.stderr.write(f"[LAN] WiZ heal runner error: {e}\n")
            sys.stderr.flush()
        finally:
            _wiz_scan_active = False
    threading.Thread(target=_run, daemon=True, name="wiz-heal").start()

async def _wiz_send(ip, params):
    bulb = wizlight(ip)
    try:
        if params.get("power") is False:
            await bulb.turn_off()
            return
        if params.get("power") is True and not params.get("color") and not params.get("brightness"):
            await bulb.turn_on(PilotBuilder())
            return
        color = params.get("color")
        if color and color.get("s", 1000) == 0:
            # Zero saturation = true white — use the dedicated white channel,
            # not the RGB LEDs (which render white weak/yellow on WiZ bulbs).
            brightness = max(0, min(255, int(color.get("v", 1000) / 1000 * 255)))
            await bulb.turn_on(PilotBuilder(colortemp=4000, brightness=brightness))
        elif color:
            r, g, b = hsv_to_rgb(color.get("h", 0), color.get("s", 1000), color.get("v", 1000))
            brightness = max(0, min(255, int(color.get("v", 1000) / 1000 * 255)))
            await bulb.turn_on(PilotBuilder(rgb=(r, g, b), brightness=brightness))
        else:
            br = params.get("brightness")
            ct = params.get("colorTemp")
            wiz_br = max(0, min(255, int((br or 500) / 1000 * 255)))
            if ct is not None:
                kelvin = max(2200, min(6500, int(2200 + ct / 1000 * 4300)))
                await bulb.turn_on(PilotBuilder(colortemp=kelvin, brightness=wiz_br))
            else:
                await bulb.turn_on(PilotBuilder(brightness=wiz_br))
    finally:
        await bulb.async_close()

def _wiz_worker(name):
    while True:
        time.sleep(0.05)
        with wiz_locks[name]:
            cmd = wiz_pending[name]
            if cmd is None:
                continue
            wiz_pending[name] = None
        now_ms = time.time() * 1000
        gap = now_ms - wiz_last_sent[name]
        if gap < MIN_GAP_MS:
            time.sleep((MIN_GAP_MS - gap) / 1000)
        ip = WIZ_CFG[name]["ip_address"]
        future = asyncio.run_coroutine_threadsafe(_wiz_send(ip, cmd), wiz_loop)
        try:
            future.result(timeout=2.0)
            wiz_last_sent[name] = time.time() * 1000
            if _wiz_quiet[name]:
                sys.stderr.write(f"[LAN/WiZ] {name} recovered\n")
                sys.stderr.flush()
                _wiz_quiet[name] = False
            _wiz_fail[name] = 0
        except Exception as e:
            if not _wiz_quiet[name]:
                sys.stderr.write(f"[LAN/WiZ] {name}: {e}\n")
                sys.stderr.flush()
            trigger_wiz_heal(name)

# ── Tuya helpers ─────────────────────────────────────────────────────────────

def hsv_to_tuya_hex(h, s, v):
    return format(int(h), "04x") + format(int(s), "04x") + format(int(v), "04x")

def build_dps(params):
    dps = {}
    if params.get("power") == False:
        dps["20"] = False
        return dps
    if params.get("power") == True:
        dps["20"] = True
    color = params.get("color")
    if color:
        dps["21"] = "colour"
        dps["24"] = hsv_to_tuya_hex(
            int(color.get("h", 0)),
            int(color.get("s", 1000)),
            int(color.get("v", 1000)),
        )
    else:
        br = params.get("brightness")
        ct = params.get("colorTemp")
        if br is not None or ct is not None:
            dps["21"] = "white"
        if br is not None:
            dps["22"] = max(10, min(1000, int(br)))
        if ct is not None:
            dps["23"] = max(0, min(1000, int(ct)))
    return dps

def send_worker(name):
    """Worker thread per Tuya bulb — drains pending queue with rate limiting."""
    while True:
        time.sleep(0.05)
        with locks[name]:
            cmd = pending[name]
            if cmd is None:
                continue
            pending[name] = None
        now_ms = time.time() * 1000
        gap = now_ms - last_sent[name]
        if gap < MIN_GAP_MS:
            time.sleep((MIN_GAP_MS - gap) / 1000)
        d = devices.get(name)
        if not d:
            continue
        dps = build_dps(cmd)
        if not dps:
            continue
        try:
            result = d.set_multiple_values(dps)
            last_sent[name] = time.time() * 1000
            if result and "Error" in str(result):
                if not _quiet[name]:
                    sys.stderr.write(f"[LAN] {name} err: {result}\n")
                    sys.stderr.flush()
                trigger_heal(name)
            else:
                if _quiet[name]:
                    sys.stderr.write(f"[LAN] {name} recovered\n")
                    sys.stderr.flush()
                    _quiet[name] = False
                _fail_counts[name] = 0
        except Exception as e:
            if not _quiet[name]:
                sys.stderr.write(f"[LAN] {name} send error: {e}\n")
                sys.stderr.flush()
            trigger_heal(name)
            try:
                cfg = BULBS_CFG[name]
                d2 = tinytuya.BulbDevice(dev_id=cfg["id"], address=cfg["ip"],
                                          local_key=cfg["key"], version=cfg.get("version", 3.5))
                d2.set_socketTimeout(1.5)
                d2.set_socketRetryLimit(1)
                devices[name] = d2
            except:
                devices[name] = None

# ── Startup / Reload ─────────────────────────────────────────────────────────

def start_bulbs():
    """Connect existing bulbs and start their worker threads."""
    for name, cfg in BULBS_CFG.items():
        if name in devices and devices[name] is not None:
            continue  # already connected
        try:
            devices[name] = connect_bulb(name, cfg)
            last_sent[name] = 0
            pending[name] = None
            locks[name] = threading.Lock()
            _fail_counts[name] = 0
            _quiet[name] = False
            # Start worker thread for this bulb
            t = threading.Thread(target=send_worker, args=(name,), daemon=True)
            t.start()
            sys.stderr.write(f"[LAN] Started worker for {name}\n")
            sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"[LAN] FAILED {name}: {e}\n")
            sys.stderr.flush()
            devices[name] = None
            last_sent[name] = 0
            pending[name] = None
            locks[name] = threading.Lock()
            _fail_counts[name] = 0
            _quiet[name] = False

    if WIZ_AVAILABLE:
        for name in WIZ_CFG:
            if name in wiz_locks and wiz_pending.get(name) is not None:
                continue  # worker already running
            wiz_pending[name] = None
            wiz_locks[name] = threading.Lock()
            wiz_last_sent[name] = 0
            _wiz_fail[name] = 0
            _wiz_quiet[name] = False
            t = threading.Thread(target=_wiz_worker, args=(name,), daemon=True)
            t.start()
            sys.stderr.write(f"[LAN] Started WiZ worker for {name}\n")
            sys.stderr.flush()

def reload_config():
    """Re-read bulbs-config.json and connect any new bulbs."""
    global BULBS_CFG, WIZ_CFG
    tuya, wiz = load_config()
    old_tuya_ids = set(BULBS_CFG.keys())
    old_wiz_ids = set(WIZ_CFG.keys())
    new_tuya = [k for k in tuya if k not in old_tuya_ids]
    new_wiz = [k for k in wiz if k not in old_wiz_ids]
    BULBS_CFG = tuya
    WIZ_CFG = wiz

    if new_tuya:
        start_bulbs()
        sys.stderr.write(f"[LAN] Reload: connected {len(new_tuya)} new Tuya bulb(s): {new_tuya}\n")
        sys.stderr.flush()
    if new_wiz:
        if WIZ_AVAILABLE:
            start_bulbs()
            sys.stderr.write(f"[LAN] Reload: connected {len(new_wiz)} new WiZ bulb(s): {new_wiz}\n")
            sys.stderr.flush()
        else:
            sys.stderr.write(f"[LAN] Reload: {len(new_wiz)} WiZ bulb(s) skipped (pywizlight not installed)\n")
            sys.stderr.flush()
    if not new_tuya and not new_wiz:
        sys.stderr.write("[LAN] Reload: no new bulbs to connect\n")
        sys.stderr.flush()

# ── Initial load ──────────────────────────────────────────────────────────────

BULBS_CFG, WIZ_CFG = load_config()
sys.stderr.write(f"[LAN] Loaded {len(BULBS_CFG)} Tuya + {len(WIZ_CFG)} WiZ bulbs from config\n")
sys.stderr.flush()

start_bulbs()

sys.stdout.write("ready\n")
sys.stdout.flush()

# ── Main loop ─────────────────────────────────────────────────────────────────

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        cmd = json.loads(line)

        # Reload command
        if cmd.get("reload"):
            reload_config()
            continue

        params = cmd.get("params", {})
        bulb_ids = cmd.get("bulbs", [])
        for bulb_id in bulb_ids:
            if bulb_id in locks:
                with locks[bulb_id]:
                    pending[bulb_id] = params
            elif WIZ_AVAILABLE and bulb_id in wiz_locks:
                with wiz_locks[bulb_id]:
                    wiz_pending[bulb_id] = params
    except Exception as e:
        sys.stderr.write(f"[LAN] parse err: {e}\n")
        sys.stderr.flush()