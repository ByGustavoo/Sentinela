import socket
import ipaddress

from scapy.all import ARP, Ether, srp, get_if_addr, conf

try:
    from mac_vendor_lookup import MacLookup
    _mac_lookup = MacLookup()
    _HAS_VENDOR = True
except Exception:
    _mac_lookup = None
    _HAS_VENDOR = False


def get_local_network():
    try:
        local_ip = get_if_addr(conf.iface)
    except Exception:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
        finally:
            s.close()

    if not local_ip or local_ip.startswith("127."):
        raise RuntimeError(
            "Não consegui identificar o IP local. Conecte-se ao Wi-Fi e tente de novo."
        )

    network = ipaddress.ip_network(local_ip + "/24", strict=False)
    return str(network), local_ip


def _lookup_vendor(mac):
    if not _HAS_VENDOR:
        return "Desconhecido"
    try:
        return _mac_lookup.lookup(mac)
    except Exception:
        return "Desconhecido"


def _lookup_hostname(ip):
    try:
        host, _, _ = socket.gethostbyaddr(ip)
        if host and host != ip:
            return host.split(".")[0]
    except Exception:
        pass
    return ""


def scan(network=None, timeout=3):
    if network is None:
        network, _ = get_local_network()

    arp = ARP(pdst=network)
    ether = Ether(dst="ff:ff:ff:ff:ff:ff")
    packet = ether / arp

    result = srp(packet, timeout=timeout, verbose=False)[0]

    devices = []
    seen = set()
    for _, received in result:
        mac = received.hwsrc.lower()
        if mac in seen:
            continue
        seen.add(mac)
        devices.append({
            "ip": received.psrc,
            "mac": mac,
            "vendor": _lookup_vendor(mac),
            "hostname": _lookup_hostname(received.psrc),
        })

    devices.sort(key=lambda d: tuple(int(p) for p in d["ip"].split(".")))
    return devices


if __name__ == "__main__":
    net, ip = get_local_network()
    print(f"IP local: {ip}  |  rede: {net}")
    print("Escaneando...")
    for d in scan(net):
        name = d["hostname"] or "—"
        print(f"  {d['ip']:16} {d['mac']}  {name:20} {d['vendor']}")
