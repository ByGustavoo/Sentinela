const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const scanBtn   = $("#scanBtn");
const list      = $("#deviceList");
const empty     = $("#empty");
const loading   = $("#loading");
const errorBox  = $("#errorBox");
const noResults = $("#noResults");
const listHead  = $("#listHead");
const meta      = $("#meta");
const stats     = $("#stats");
const toolbar   = $("#toolbar");
const subbar    = $("#subbar");
const blockWarn = $("#blockWarn");
const searchInput = $("#searchInput");
const autoToggle  = $("#autoToggle");
const themeToggle = $("#themeToggle");
const sortDirBtn  = $("#sortDirBtn");

const sortSelect = $("#sortSelect");
const sortBtn    = $("#sortBtn");
const sortMenu   = $("#sortMenu");
const sortVal    = $("#sortVal");
const SORT_LABELS = { ip: "IP", name: "Nome", vendor: "Fabricante", mac: "MAC" };

const lastUpdate     = $("#lastUpdate");
const lastUpdateText = $("#lastUpdateText");

const AUTO_MS = 30000;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const deviceModal = $("#deviceModal");

const API_BASE = "";
async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}
const api = {
  scan:    ()           => apiPost("/api/scan"),
  label:   (mac, fields) => apiPost("/api/label", { mac, ...fields }),
  block:   (mac, ip)    => apiPost("/api/block", { mac, ip }),
  unblock: (mac)        => apiPost("/api/unblock", { mac }),
};

let animateEntrance = false;

let localIp = null;
let devices = [];
let canBlock = true;
let activeFilter = "all";
let query = "";
let sortKey = "ip";
let sortDir = "asc";
let autoTimer = null;
let lastScanAt = null;
let luTimer = null;

function applyTheme(theme, animate) {
  const root = document.documentElement;
  if (animate && !reduceMotion) {
    root.classList.add("theme-anim");
    setTimeout(() => root.classList.remove("theme-anim"), 460);
  }
  root.setAttribute("data-theme", theme);
  try { localStorage.setItem("sentinela-theme", theme); } catch (_) {}
  themeToggle.setAttribute("aria-label",
    theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro");
}
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next, true);
});

scanBtn.addEventListener("click", () => scan());
searchInput.addEventListener("input", () => { query = searchInput.value.trim().toLowerCase(); render(); });

$$("[data-filter]").forEach((el) =>
  el.addEventListener("click", () => setFilter(el.dataset.filter)));

$$(".list-head .sortable").forEach((btn) =>
  btn.addEventListener("click", () => setSort(btn.dataset.sort)));
sortDirBtn.addEventListener("click", () => { sortDir = sortDir === "asc" ? "desc" : "asc"; syncSortUI(); render(); });

autoToggle.addEventListener("change", () => {
  if (autoToggle.checked) startAuto(); else stopAuto();
});

function openSort() {
  sortSelect.classList.add("open");
  sortBtn.setAttribute("aria-expanded", "true");
  sortMenu.hidden = false;
  const sel = sortMenu.querySelector('[aria-selected="true"]') || sortMenu.firstElementChild;
  sel && sel.focus && sortMenu.focus();
}
function closeSort() {
  sortSelect.classList.remove("open");
  sortBtn.setAttribute("aria-expanded", "false");
  sortMenu.hidden = true;
}
sortBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  sortSelect.classList.contains("open") ? closeSort() : openSort();
});
sortMenu.querySelectorAll(".select-opt").forEach((opt) => {
  opt.addEventListener("click", () => { setSort(opt.dataset.value, true); closeSort(); sortBtn.focus(); });
});
sortSelect.addEventListener("keydown", (e) => {
  const opts = [...sortMenu.querySelectorAll(".select-opt")];
  const cur = opts.findIndex((o) => o.getAttribute("aria-selected") === "true");
  if (e.key === "Escape") { closeSort(); sortBtn.focus(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!sortSelect.classList.contains("open")) return openSort();
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const next = (cur + dir + opts.length) % opts.length;
    setSort(opts[next].dataset.value, true);
  } else if ((e.key === "Enter" || e.key === " ") && sortSelect.classList.contains("open")) {
    e.preventDefault(); closeSort(); sortBtn.focus();
  }
});
document.addEventListener("click", (e) => {
  if (sortSelect.classList.contains("open") && !sortSelect.contains(e.target)) closeSort();
});

function setFilter(f) {
  activeFilter = f;
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === f));
  $$(".stat-card").forEach((c) => c.classList.toggle("sel", c.dataset.filter === f));
  render();
}

function setSort(key, keepDir) {
  if (key === sortKey && !keepDir) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else if (key !== sortKey) {
    sortKey = key;
    if (!keepDir) sortDir = "asc";
  }
  syncSortUI();
  render();
}

function syncSortUI() {
  sortVal.textContent = SORT_LABELS[sortKey] || "IP";
  sortMenu.querySelectorAll(".select-opt").forEach((o) =>
    o.setAttribute("aria-selected", o.dataset.value === sortKey ? "true" : "false"));
  const asc = sortDir === "asc";
  sortDirBtn.classList.toggle("desc", !asc);
  sortDirBtn.setAttribute("aria-label", asc ? "Inverter ordem (crescente)" : "Inverter ordem (decrescente)");
  $$(".list-head .sortable").forEach((btn) => {
    const active = btn.dataset.sort === sortKey;
    btn.classList.toggle("active", active);
    btn.querySelector(".arr").textContent = active ? (asc ? "▲" : "▼") : "";
  });
}

function startAuto() {
  stopAuto();
  autoTimer = setInterval(() => {
    const modalOpen = !deviceModal.hidden;
    const confirming = document.querySelector(".btn-block.confirm");
    if (modalOpen || confirming || scanBtn.disabled) return;
    scan({ auto: true });
  }, AUTO_MS);
}
function stopAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}

function twoDigits(n) { return String(n).padStart(2, "0"); }
function clockOf(d) { return `${twoDigits(d.getHours())}:${twoDigits(d.getMinutes())}`; }

function setUpdating() {
  lastUpdate.hidden = false;
  lastUpdate.classList.add("is-scanning");
  lastUpdate.classList.remove("is-fresh");
  lastUpdateText.textContent = "Atualizando…";
}
function setUpdated(ts) {
  lastScanAt = ts || Date.now();
  lastUpdate.hidden = false;
  lastUpdate.classList.remove("is-scanning");
  lastUpdate.classList.add("is-fresh");
  setTimeout(() => lastUpdate.classList.remove("is-fresh"), 1200);
  renderLastUpdate();
  if (!luTimer) luTimer = setInterval(renderLastUpdate, 20000);
}
function renderLastUpdate() {
  if (lastScanAt == null || lastUpdate.classList.contains("is-scanning")) return;
  const now = new Date();
  const when = new Date(lastScanAt);
  const secs = Math.round((now - when) / 1000);
  let txt;
  if (secs < 15) txt = "Atualizado agora";
  else if (secs < 3600) txt = `Atualizado há ${Math.max(1, Math.round(secs / 60))} min`;
  else if (when.toDateString() === now.toDateString()) txt = `Atualizado hoje às ${clockOf(when)}`;
  else txt = `Atualizado em ${twoDigits(when.getDate())}/${twoDigits(when.getMonth() + 1)} às ${clockOf(when)}`;
  lastUpdateText.textContent = txt;
}

async function scan(opts = {}) {
  const auto = !!opts.auto;
  setUpdating();
  if (!auto) {
    scanBtn.disabled = true;
    scanBtn.classList.add("scanning");
    $(".scan-label").textContent = "Escaneando…";
    showOnly(devices.length ? null : loading);
    errorBox.hidden = true;
  }

  try {
    const data = await api.scan();
    if (!data.ok) throw new Error(data.error || "Falha no scan");

    localIp = data.local_ip;
    devices = data.devices || [];
    canBlock = data.can_block !== false;

    $("#mNet").textContent   = data.network || "—";
    $("#mLocal").textContent = data.local_ip || "—";
    $("#mGw").textContent    = data.gateway_ip || "—";
    meta.hidden = false;
    stats.hidden = false;
    toolbar.hidden = false;
    subbar.hidden = false;
    syncSortUI();
    updateBlockWarning(data.gateway_ip);

    animateEntrance = true;
    render();
    animateEntrance = false;
    setUpdated();
    if (!auto) toast(`${devices.length} aparelho(s) na rede.`);
  } catch (e) {
    lastUpdate.classList.remove("is-scanning");
    renderLastUpdate();
    if (!auto) showError(e.message);
    else toast("Falha ao atualizar automaticamente.", true);
  } finally {
    if (!auto) {
      scanBtn.disabled = false;
      scanBtn.classList.remove("scanning");
      $(".scan-label").textContent = "Escanear de novo";
    }
  }
}

function updateBlockWarning(gatewayIp) {
  if (canBlock) { blockWarn.hidden = true; return; }
  $("#blockWarnMsg").textContent =
    `Não consegui resolver o MAC do roteador${gatewayIp ? " (" + gatewayIp + ")" : ""}. ` +
    "Rode o Sentinela como administrador (e confira o Npcap no Windows), depois escaneie de novo.";
  blockWarn.hidden = false;
}

function counts() {
  let known = 0, unknown = 0, blocked = 0;
  for (const d of devices) {
    if (d.ip === localIp) continue;
    if (d.blocked) blocked++;
    else if (d.status === "known") known++;
    else unknown++;
  }
  return { all: devices.length, known, unknown, blocked };
}

function animateCount(el, to) {
  const from = parseInt(el.dataset.val || "0", 10) || 0;
  el.dataset.val = String(to);
  if (reduceMotion || from === to) { el.textContent = to; return; }
  const dur = 450, t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateCounts() {
  const c = counts();
  animateCount($("#cAll"), c.all);
  animateCount($("#cKnown"), c.known);
  animateCount($("#cUnknown"), c.unknown);
  animateCount($("#cBlocked"), c.blocked);
}

function stateOf(d) {
  if (d.ip === localIp) return "self";
  if (d.blocked) return "blocked";
  return d.status === "known" ? "known" : "unknown";
}

function matches(d) {
  const st = stateOf(d);
  if (activeFilter !== "all" && st !== activeFilter) return false;
  if (!query) return true;
  const hay = [d.name, d.hostname, d.vendor, d.ip, d.mac].join(" ").toLowerCase();
  return hay.includes(query);
}

function ipNum(ip) {
  return (ip || "").split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}

function compare(a, b) {
  const dir = sortDir === "asc" ? 1 : -1;
  let av, bv;
  if (sortKey === "ip") return dir * (ipNum(a.ip) - ipNum(b.ip));
  if (sortKey === "name")   { av = (a.name || a.hostname || "").toLowerCase(); bv = (b.name || b.hostname || "").toLowerCase(); }
  else if (sortKey === "vendor") { av = (a.vendor || "").toLowerCase(); bv = (b.vendor || "").toLowerCase(); }
  else { av = a.mac || ""; bv = b.mac || ""; }
  if (av < bv) return -1 * dir;
  if (av > bv) return 1 * dir;
  return ipNum(a.ip) - ipNum(b.ip);
}

function render() {
  updateCounts();
  if (!devices.length) { showOnly(empty); return; }

  const shown = devices.filter(matches).sort(compare);
  if (!shown.length) { showOnly(noResults); return; }

  list.innerHTML = "";
  const tpl = $("#rowTpl");
  shown.forEach((d, i) => list.appendChild(buildRow(d, tpl, i)));

  showOnly(list);
  listHead.hidden = false;
}

function buildRow(d, tpl, index) {
  const isSelf = d.ip === localIp;
  const node = tpl.content.cloneNode(true);
  const li = node.querySelector(".device");
  const state = stateOf(d);

  li.classList.add(state);
  li.dataset.mac = d.mac;
  li.dataset.ip = d.ip;
  if (animateEntrance) li.style.setProperty("--i", Math.min(index, 12));
  else li.style.animation = "none";

  const identBtn = node.querySelector(".ident");
  const nameTxt = node.querySelector(".name-txt");
  const displayName = d.name || (isSelf ? "Este computador" : (d.hostname || "Aparelho sem nome"));
  nameTxt.textContent = displayName;
  nameTxt.classList.toggle("empty", !d.name && !isSelf && !d.hostname);
  const hostEl = node.querySelector(".hostname");
  hostEl.textContent = isSelf ? (d.hostname || "Nome de rede não divulgado")
                              : (d.hostname || "Nome não divulgado");
  hostEl.title = hostEl.textContent;
  const vendorEl = node.querySelector(".vendor");
  vendorEl.textContent = d.vendor || "Fabricante desconhecido";
  vendorEl.title = vendorEl.textContent;
  node.querySelector(".ip").textContent = d.ip;
  node.querySelector(".mac").textContent = d.mac;

  const knownBtn = node.querySelector(".btn-known");
  const blockBtn = node.querySelector(".btn-block");

  if (isSelf) {
    identBtn.disabled = true;
    identBtn.setAttribute("aria-label", "Este computador");
    node.querySelector(".actions").innerHTML = '<span class="self-tag">Você</span>';
    return node;
  }

  identBtn.addEventListener("click", () => openModal(d));

  if (d.status === "known") knownBtn.classList.add("active");
  if (d.blocked) { blockBtn.classList.add("active"); blockBtn.textContent = "Desbloquear"; }

  if (!canBlock && !d.blocked) {
    blockBtn.disabled = true;
    blockBtn.classList.add("na");
    blockBtn.title = "Bloqueio indisponível: não consegui resolver o MAC do roteador.";
  }

  knownBtn.addEventListener("click", async () => {
    const newStatus = d.status === "known" ? "unknown" : "known";
    d.status = newStatus;
    await label(d.mac, { status: newStatus });
    li.classList.remove("known", "unknown");
    li.classList.add(newStatus);
    knownBtn.classList.toggle("active", newStatus === "known");
    updateCounts();
  });

  blockBtn.addEventListener("click", () => onBlockClick(li, blockBtn, d));
  return node;
}

let confirmTimer;
function onBlockClick(li, btn, d) {
  const isBlocked = li.classList.contains("blocked");
  if (isBlocked) { toggleBlock(li, btn, d, false); return; }

  if (!btn.classList.contains("confirm")) {
    btn.classList.add("confirm");
    btn.textContent = "Confirmar bloqueio";
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => resetConfirm(btn), 3500);
    return;
  }
  clearTimeout(confirmTimer);
  resetConfirm(btn);
  toggleBlock(li, btn, d, true);
}

function resetConfirm(btn) {
  btn.classList.remove("confirm");
  if (!btn.classList.contains("active")) btn.textContent = "Bloquear";
}

async function toggleBlock(li, btn, d, wantBlock) {
  btn.disabled = true;
  try {
    const data = wantBlock ? await api.block(d.mac, d.ip) : await api.unblock(d.mac);
    if (!data.ok) throw new Error(data.error || "Não foi possível concluir");

    d.blocked = wantBlock;
    if (wantBlock) {
      li.classList.remove("known", "unknown");
      li.classList.add("blocked");
      btn.classList.add("active");
      btn.textContent = "Desbloquear";
      toast(`Acesso de ${d.name || d.hostname || d.ip} cortado.`);
    } else {
      li.classList.remove("blocked");
      li.classList.add(d.status === "known" ? "known" : "unknown");
      btn.classList.remove("active");
      btn.textContent = "Bloquear";
      toast("Acesso devolvido ao aparelho.");
    }
    updateCounts();
  } catch (e) {
    toast(e.message || "Erro ao bloquear", true);
  } finally {
    btn.disabled = false;
  }
}

async function label(mac, fields) {
  try {
    await api.label(mac, fields);
  } catch (_) {}
}

const dmName  = $("#dmName");
const dmKnown = $("#dmKnown");
const dmSave  = $("#dmSave");
let modalDevice = null;
let lastFocused = null;

function openModal(d) {
  modalDevice = d;
  lastFocused = document.activeElement;
  const state = stateOf(d);
  $("#dmHead").className = "dm-head " + state;
  $("#dmTitle").textContent = d.name || d.hostname || "Aparelho sem nome";
  $("#dmSub").textContent = d.vendor || "Fabricante desconhecido";
  const badge = $("#dmBadge");
  badge.className = "dm-badge " + state;
  badge.textContent = state === "blocked" ? "Bloqueado" : state === "known" ? "Conhecido" : "Desconhecido";
  $("#dmVendor").textContent = d.vendor || "Desconhecido";
  $("#dmVendor").title = d.vendor || "";
  $("#dmHost").textContent = d.hostname || "Não divulgado";
  $("#dmIp").textContent = d.ip;
  $("#dmMac").textContent = d.mac;
  dmName.value = d.name || "";
  dmKnown.checked = d.status === "known";
  deviceModal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => dmName.focus(), 50);
}

function closeModal() {
  if (deviceModal.hidden) return;
  deviceModal.hidden = true;
  document.body.style.overflow = "";
  modalDevice = null;
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

async function saveModal() {
  if (!modalDevice) return;
  const d = modalDevice;
  const newName = dmName.value.trim();
  const newStatus = dmKnown.checked ? "known" : "unknown";
  const fields = {};
  if (newName !== (d.name || "")) fields.name = newName;
  if (newStatus !== d.status)     fields.status = newStatus;
  d.name = newName;
  d.status = newStatus;
  if (Object.keys(fields).length) await label(d.mac, fields);
  closeModal();
  render();
  toast("Aparelho atualizado.");
}

dmSave.addEventListener("click", saveModal);
dmName.addEventListener("keydown", (e) => { if (e.key === "Enter") saveModal(); });
deviceModal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
document.addEventListener("keydown", (e) => {
  if (deviceModal.hidden) return;
  if (e.key === "Escape") { closeModal(); return; }
  if (e.key !== "Tab") return;
  const focusables = [...deviceModal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

function showOnly(el) {
  for (const n of [empty, loading, errorBox, noResults, list]) n.hidden = (n !== el);
  if (el !== list) listHead.hidden = true;
}

function showError(msg) {
  $("#errMsg").textContent = msg || "Erro desconhecido.";
  showOnly(errorBox);
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}
