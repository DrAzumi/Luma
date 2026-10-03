#!/usr/bin/env python3
"""
LUMA — LAN Discovery Script
Scans for Tuya and WiZ bulbs on the local network.
Outputs JSON to stdout for the Node.js server to consume.

Usage:
  python3 discover.py scan-tuya
  python3 discover.py scan-wiz
"""
import sys
import json
import asyncio


def scan_tuya():
    """Scan LAN for Tuya devices using tinytuya."""
    try:
        import tinytuya
    except ImportError:
        sys.stderr.write("[Discover] tinytuya not installed\n")
        sys.stderr.flush()
        return []

    try:
        result = tinytuya.deviceScan(verbose=False, maxretry=3)
        devices = []
        for ip, info in result.items():
            devices.append({
                "gwId": info.get("gwId", ip),
                "ip": info.get("ip", ip),
                "version": str(info.get("version", "3.3")),
                "product_name": info.get("product_name", ""),
                "mac": info.get("mac", ""),
                "name": info.get("name", ""),
            })
        return devices
    except Exception as e:
        sys.stderr.write(f"[Discover] Tuya scan error: {e}\n")
        sys.stderr.flush()
        return []


async def scan_wiz():
    """Scan LAN for WiZ bulbs using pywizlight."""
    try:
        from pywizlight.discovery import find_wizlights
    except ImportError:
        sys.stderr.write("[Discover] pywizlight not installed\n")
        sys.stderr.flush()
        return []

    try:
        # Determine broadcast address from local IP
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1)
        try:
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
        except OSError:
            local_ip = "192.168.1.1"
        s.close()
        parts = local_ip.split(".")
        broadcast = f"{parts[0]}.{parts[1]}.{parts[2]}.255"

        lights = await find_wizlights(wait_time=5, broadcast_address=broadcast)
        devices = []
        for light in lights:
            devices.append({
                "ip": light.ip_address,
                "mac": (light.mac_address or "").replace(":", "").lower(),
            })
        return devices
    except Exception as e:
        sys.stderr.write(f"[Discover] WiZ scan error: {e}\n")
        sys.stderr.flush()
        return []


def get_key(dev_id, ip, version="3.5"):
    """
    Try to extract the local key from a Tuya device over LAN.
    This works best if the device was previously paired and is on the network.
    For v3.5 devices, direct extraction often requires the key itself,
    but we try a few approaches:
      1. Empty key
      2. Common zero key
      3. Check devices.json in the project root
    Returns the key as a string, or None.
    """
    import tinytuya

    # ── Method 1: Try connecting with empty key ─────────────────────────────
    d = tinytuya.Device(dev_id=dev_id, address=ip, local_key="", version=float(version))
    d.set_socketTimeout(2)
    d.set_socketRetryLimit(1)
    try:
        data = d.status()
        if hasattr(d, "key") and d.key and len(d.key) > 4:
            return d.key
    except Exception:
        pass

    # ── Method 2: Try zero key ──────────────────────────────────────────────
    d2 = tinytuya.Device(dev_id=dev_id, address=ip, local_key="0000000000000000", version=float(version))
    d2.set_socketTimeout(2)
    d2.set_socketRetryLimit(1)
    try:
        data = d2.status()
        if hasattr(d2, "key") and d2.key and len(d2.key) > 4:
            return d2.key
    except Exception:
        pass

    # ── Method 3: Check devices.json ────────────────────────────────────────
    import os
    devices_path = os.path.join(os.path.dirname(__file__), "..", "devices.json")
    if os.path.exists(devices_path):
        try:
            with open(devices_path) as f:
                devices = json.load(f)
            if isinstance(devices, dict):
                # tinytuya format: {ip: {id: ..., key: ..., ...}}
                for ip_addr, info in devices.items():
                    if info.get("id") == dev_id or info.get("gwId") == dev_id:
                        return info.get("key") or info.get("localKey") or ""
            elif isinstance(devices, list):
                # devices.json list format
                for entry in devices:
                    if entry.get("id") == dev_id:
                        return entry.get("key") or entry.get("localKey") or ""
        except Exception:
            pass

    return None


def get_keys_from_devices_json():
    """Read all local keys from devices.json and return as a dict: {deviceId: localKey}."""
    import os
    keys = {}
    devices_path = os.path.join(os.path.dirname(__file__), "..", "devices.json")
    if not os.path.exists(devices_path):
        return keys
    try:
        with open(devices_path) as f:
            devices = json.load(f)
        if isinstance(devices, dict):
            for ip_addr, info in devices.items():
                did = info.get("id") or info.get("gwId")
                if did:
                    keys[did] = info.get("key") or info.get("localKey") or ""
        elif isinstance(devices, list):
            for entry in devices:
                did = entry.get("id") or entry.get("gwId")
                if did:
                    keys[did] = entry.get("key") or entry.get("localKey") or ""
    except Exception:
        pass
    return keys

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command. Use: scan-tuya | scan-wiz | get-key | get-keys"}))
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "scan-tuya":
        devices = scan_tuya()
        print(json.dumps(devices))
    elif cmd == "scan-wiz":
        devices = asyncio.run(scan_wiz())
        print(json.dumps(devices))
    elif cmd == "get-key":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Usage: get-key <devId> <ip> [version]"}))
            sys.exit(1)
        dev_id = sys.argv[2]
        ip = sys.argv[3]
        version = sys.argv[4] if len(sys.argv) > 4 else "3.5"
        key = get_key(dev_id, ip, version)
        if key:
            print(json.dumps({"ok": True, "localKey": key, "source": "lan"}))
        else:
            # Last resort: check devices.json one more time
            keys = get_keys_from_devices_json()
            if dev_id in keys:
                print(json.dumps({"ok": True, "localKey": keys[dev_id], "source": "devices_json"}))
            else:
                print(json.dumps({"ok": False, "error": "Could not extract key. Run: python3 -m tinytuya wizard"}))
    elif cmd == "get-keys":
        keys = get_keys_from_devices_json()
        print(json.dumps({"ok": True, "keys": keys}))
    else:
        print(json.dumps({"error": f"Unknown command: {cmd}"}))
        sys.exit(1)