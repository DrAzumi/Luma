#!/usr/bin/env python3
"""
LUMA LAN Daemon v4 — rate-limited per-bulb queues (Tuya + WiZ)
Prevents bulb lockup by dropping stale commands
and enforcing minimum gap between sends
"""
import sys, json, time, threading, asyncio
import tinytuya

try:
    from pywizlight import wizlight, PilotBuilder
    WIZ_AVAILABLE = True
except ImportError:
    WIZ_AVAILABLE = False
    sys.stderr.write("[LAN] pywizlight not found — WiZ bulbs disabled (pip install pywizlight)\n")
    sys.stderr.flush()

BULBS_CFG = {
    'bedroom':        {'id': 'd7e7212acc0425c719jhzh', 'key': 'YcWq_Bq2&=W7[aOh',  'ip': '192.168.1.4'},
    'hall':           {'id': 'd779f624e271236eeeiogr', 'key': '[d;/L.EBXQ@?&b_6',  'ip': '192.168.1.16'},
    'washingmachine': {'id': 'd75d679deb6e48e3c6ylwa', 'key': 'JmPNyLh+Huf>_>Is',  'ip': '192.168.1.5'},
}

# Philips WiZ bulbs — update IPs after running pywizlight discovery
WIZ_CFG = {
    'livingroom':  {'ip_address': '192.168.1.6', 'mac_address': '9877d53d10a6'},   # TODO: replace with actual IP
    'bedroom_wiz': {'ip_address': '192.168.1.2', 'mac_address': '9877d505010a'},   # TODO: replace with actual IP
}

# Minimum ms between commands per bulb — prevents lockup
# 200ms = max 5 commands/second per bulb, well within safe limits
MIN_GAP_MS = 200

devices   = {}
last_sent = {}  # bulb_id -> timestamp of last successful send
pending   = {}  # bulb_id -> latest pending command (older ones dropped)
locks     = {}  # bulb_id -> threading.Lock

def connect_bulb(name, cfg):
    d = tinytuya.BulbDevice(
        dev_id=cfg['id'],
        address=cfg['ip'],
        local_key=cfg['key'],
        version=3.5
    )
    d.set_socketTimeout(1.5)
    d.set_socketRetryLimit(1)
    status = d.status()
    sys.stderr.write(f"[LAN] connected {name}\n")
    sys.stderr.flush()
    return d

for name, cfg in BULBS_CFG.items():
    try:
        devices[name]   = connect_bulb(name, cfg)
        last_sent[name] = 0
        pending[name]   = None
        locks[name]     = threading.Lock()
    except Exception as e:
        sys.stderr.write(f"[LAN] FAILED {name}: {e}\n")
        sys.stderr.flush()
        devices[name]   = None
        last_sent[name] = 0
        pending[name]   = None
        locks[name]     = threading.Lock()

sys.stdout.write("ready\n")
sys.stdout.flush()

# ── WiZ support ──────────────────────────────────────────────────────────────

def hsv_to_rgb(h, s, v):
    """HSV (h:0-360, s:0-1000, v:0-1000) → RGB (0-255) for WiZ"""
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

wiz_loop     = asyncio.new_event_loop()
wiz_pending  = {name: None for name in WIZ_CFG}
wiz_locks    = {name: threading.Lock() for name in WIZ_CFG}
wiz_last_sent = {name: 0 for name in WIZ_CFG}

def _start_wiz_loop():
    asyncio.set_event_loop(wiz_loop)
    wiz_loop.run_forever()

threading.Thread(target=_start_wiz_loop, daemon=True).start()

async def _wiz_send(ip, params):
    bulb = wizlight(ip)
    try:
        if params.get('power') is False:
            await bulb.turn_off()
            return
        if params.get('power') is True and not params.get('color') and not params.get('brightness'):
            await bulb.turn_on(PilotBuilder())
            return
        color = params.get('color')
        if color:
            r, g, b = hsv_to_rgb(color.get('h', 0), color.get('s', 1000), color.get('v', 1000))
            brightness = max(0, min(255, int(color.get('v', 1000) / 1000 * 255)))
            await bulb.turn_on(PilotBuilder(rgb=(r, g, b), brightness=brightness))
        else:
            br = params.get('brightness')
            ct = params.get('colorTemp')
            wiz_br = max(0, min(255, int((br or 500) / 1000 * 255)))
            if ct is not None:
                kelvin = max(2200, min(6500, int(2200 + ct / 1000 * 4300)))
                await bulb.turn_on(PilotBuilder(colortemp=kelvin, brightness=wiz_br))
            else:
                await bulb.turn_on(PilotBuilder(brightness=wiz_br))
    finally:
        await bulb.async_close()

def _wiz_worker(name):
    ip = WIZ_CFG[name]['ip_address']
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

        future = asyncio.run_coroutine_threadsafe(_wiz_send(ip, cmd), wiz_loop)
        try:
            future.result(timeout=2.0)
            wiz_last_sent[name] = time.time() * 1000
        except Exception as e:
            sys.stderr.write(f"[LAN/WiZ] {name}: {e}\n")
            sys.stderr.flush()

if WIZ_AVAILABLE:
    for name in WIZ_CFG:
        threading.Thread(target=_wiz_worker, args=(name,), daemon=True).start()
    sys.stderr.write(f"[LAN] WiZ workers started for: {list(WIZ_CFG.keys())}\n")
    sys.stderr.flush()

# ── Tuya helpers ─────────────────────────────────────────────────────────────

def hsv_to_tuya_hex(h, s, v):
    return format(int(h), '04x') + format(int(s), '04x') + format(int(v), '04x')

def build_dps(params):
    dps = {}
    if params.get('power') == False:
        dps['20'] = False
        return dps
    if params.get('power') == True:
        dps['20'] = True
    color = params.get('color')
    if color:
        dps['21'] = 'colour'
        dps['24'] = hsv_to_tuya_hex(
            int(color.get('h', 0)),
            int(color.get('s', 1000)),
            int(color.get('v', 1000))
        )
    else:
        br = params.get('brightness')
        ct = params.get('colorTemp')
        if br is not None or ct is not None:
            dps['21'] = 'white'
        if br is not None:
            dps['22'] = max(10, min(1000, int(br)))
        if ct is not None:
            dps['23'] = max(0, min(1000, int(ct)))
    return dps

def send_worker(name):
    """Worker thread per bulb — drains pending queue with rate limiting"""
    while True:
        time.sleep(0.05)  # check every 50ms
        with locks[name]:
            cmd = pending[name]
            if cmd is None:
                continue
            pending[name] = None  # consume it

        now_ms = time.time() * 1000
        gap    = now_ms - last_sent[name]
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
            # Only log errors, not successes — reduces terminal noise
            if result and 'Error' in str(result):
                sys.stderr.write(f"[LAN] {name} err: {result}\n")
                sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"[LAN] {name} send error: {e}\n")
            sys.stderr.flush()
            # Try to reconnect
            try:
                cfg = BULBS_CFG[name]
                devices[name] = connect_bulb(name, cfg)
            except:
                devices[name] = None

# Start one worker thread per bulb
for name in BULBS_CFG:
    t = threading.Thread(target=send_worker, args=(name,), daemon=True)
    t.start()

# Main loop: read commands from stdin, put latest in pending queue
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        cmd = json.loads(line)
        params   = cmd.get('params', {})
        bulb_ids = cmd.get('bulbs', [])
        for bulb_id in bulb_ids:
            if bulb_id in locks:
                with locks[bulb_id]:
                    pending[bulb_id] = params  # overwrite — only latest matters
            elif WIZ_AVAILABLE and bulb_id in wiz_locks:
                with wiz_locks[bulb_id]:
                    wiz_pending[bulb_id] = params
    except Exception as e:
        sys.stderr.write(f"[LAN] parse err: {e}\n")
        sys.stderr.flush()