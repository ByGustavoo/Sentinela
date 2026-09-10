import json
import os
import threading

_PATH = os.path.join(os.path.dirname(__file__), "known_devices.json")
_lock = threading.Lock()


def _load():
    if not os.path.exists(_PATH):
        return {}
    try:
        with open(_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save(data):
    with open(_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def all_devices():
    with _lock:
        return _load()


def get(mac):
    return _load().get(mac.lower())


def set_label(mac, name=None, status=None):
    mac = mac.lower()
    with _lock:
        data = _load()
        entry = data.get(mac, {"name": "", "status": "unknown"})
        if name is not None:
            entry["name"] = name
        if status is not None:
            entry["status"] = status
        data[mac] = entry
        _save(data)
        return entry
