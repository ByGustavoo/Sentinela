from flask import Flask, jsonify, request, render_template

import scanner
import store
from blocker import Blocker

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True
blocker = Blocker()

_last_scan = []


def _merge(devices):
    merged = []
    for d in devices:
        saved = store.get(d["mac"]) or {}
        merged.append({
            **d,
            "hostname": d.get("hostname", ""),
            "name": saved.get("name", ""),
            "status": saved.get("status", "unknown"),
            "blocked": blocker.is_blocking(d["mac"]),
        })
    return merged


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/scan", methods=["POST"])
def api_scan():
    global _last_scan
    try:
        network, local_ip = scanner.get_local_network()
        devices = scanner.scan(network)
        _last_scan = _merge(devices)
        gateway_mac = blocker.refresh_gateway()
        return jsonify({
            "ok": True,
            "network": network,
            "local_ip": local_ip,
            "gateway_ip": blocker.gateway_ip,
            "gateway_mac": gateway_mac,
            "can_block": bool(gateway_mac),
            "devices": _last_scan,
        })
    except PermissionError:
        return jsonify({"ok": False, "error": "Rode o programa como administrador (sudo)."}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/devices")
def api_devices():
    return jsonify({"ok": True, "devices": _merge([
        {"ip": d["ip"], "mac": d["mac"], "vendor": d["vendor"],
         "hostname": d.get("hostname", "")} for d in _last_scan
    ])})


@app.route("/api/label", methods=["POST"])
def api_label():
    body = request.get_json(force=True)
    mac = body.get("mac")
    if not mac:
        return jsonify({"ok": False, "error": "mac faltando"}), 400
    entry = store.set_label(mac, name=body.get("name"), status=body.get("status"))
    return jsonify({"ok": True, "entry": entry})


@app.route("/api/block", methods=["POST"])
def api_block():
    body = request.get_json(force=True)
    mac = body.get("mac")
    ip = body.get("ip")
    if not mac or not ip:
        return jsonify({"ok": False, "error": "mac e ip são obrigatórios"}), 400
    try:
        blocker.block(ip, mac)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/unblock", methods=["POST"])
def api_unblock():
    body = request.get_json(force=True)
    mac = body.get("mac")
    blocker.unblock(mac)
    return jsonify({"ok": True})


if __name__ == "__main__":
    try:
        app.run(host="127.0.0.1", port=5000, debug=False)
    finally:
        blocker.unblock_all()
