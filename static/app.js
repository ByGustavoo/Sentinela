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
const toolbar   = $("#toolbar");
const subbar    = $("#subbar");
const blockWarn = $("#blockWarn");
const searchInput = $("#searchInput");
const autoToggle  = $("#autoToggle");
const sortSelect  = $("#sortSelect");
const sortDirBtn  = $("#sortDirBtn");

const AUTO_MS = 30000;   // intervalo do rescan automático

let localIp = null;
let devices = [];              // último scan (dados crus)
let canBlock = true;           // roteador resolvido? define se o bloqueio funciona
let activeFilter = "all";
let query = "";
let sortKey = "ip";            // ip | name | vendor | mac
let sortDir = "asc";           // asc | desc
let autoTimer = null;

scanBtn.addEventListener("click", () => scan());
searchInput.addEventListener("input", () => { query = searchInput.value.trim().toLowerCase(); render(); });

// chips e cards de estatística compartilham o mesmo filtro
$$("[data-filter]").forEach((el) =>
  el.addEventListener("click", () => setFilter(el.dataset.filter)));

// ordenação: cabeçalhos clicáveis (desktop) + select (mobile) + botão de direção
$$(".list-head .sortable").forEach((btn) =>
  btn.addEventListener("click", () => setSort(btn.dataset.sort)));
sortSelect.addEventListener("change", () => setSort(sortSelect.value, /*keepDir*/ true));
sortDirBtn.addEventListener("click", () => { sortDir = sortDir === "asc" ? "desc" : "asc"; syncSortUI(); render(); });

// rescan automático
autoToggle.addEventListener("change", () => {
  if (autoToggle.checked) startAuto(); else stopAuto();
});

function setFilter(f) {
  activeFilter = f;
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === f));
  $$(".meta-card.stat").forEach((c) => c.classList.toggle("sel", c.dataset.filter === f));
  render();
}

function setSort(key, keepDir) {
  if (key === sortKey && !keepDir) {
    sortDir = sortDir === "asc" ? "desc" : "asc";   // reclicou a mesma coluna: inverte
  } else if (key !== sortKey) {
    sortKey = key;
    sortDir = "asc";
  }
  syncSortUI();
  render();
}

function syncSortUI() {
  sortSelect.value = sortKey;
  const asc = sortDir === "asc";
  sortDirBtn.querySelector(".sort-dir-ico").textContent = asc ? "↑" : "↓";
  sortDirBtn.classList.toggle("desc", !asc);
  sortDirBtn.setAttribute("aria-label", asc ? "Inverter ordem (crescente)" : "Inverter ordem (decrescente)");
  $$(".list-head .sortable").forEach((btn) => {
    const active = btn.dataset.sort === sortKey;
    btn.classList.toggle("active", active);
    btn.querySelector(".arr").textContent = active ? (asc ? "▲" : "▼") : "";
  });
}

/* ---------------- rescan automático ---------------- */
function startAuto() {
  stopAuto();
  autoTimer = setInterval(() => {
    // não atropela o usuário: pula o tick se estiver digitando um apelido
    // ou se houver um bloqueio aguardando confirmação
    const editing = document.activeElement && document.activeElement.classList.contains("name-input");
    const confirming = document.querySelector(".btn-block.confirm");
    if (editing || confirming || scanBtn.disabled) return;
    scan({ auto: true });
  }, AUTO_MS);
}
function stopAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}

/* ---------------- scan ---------------- */
async function scan(opts = {}) {
  const auto = !!opts.auto;
  if (!auto) {
    scanBtn.disabled = true;
    scanBtn.classList.add("scanning");
    $(".scan-label").textContent = "Escaneando…";
    showOnly(devices.length ? null : loading);   // 1º scan: skeleton
    errorBox.hidden = true;
  }

  try {
    const res = await fetch("/api/scan", { method: "POST" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Falha no scan");

    localIp = data.local_ip;
    devices = data.devices || [];
    canBlock = data.can_block !== false;   // ausente = assume que dá pra bloquear

    $("#mNet").textContent   = data.network || "—";
    $("#mLocal").textContent = data.local_ip || "—";
    $("#mGw").textContent    = data.gateway_ip || "—";
    meta.hidden = false;
    toolbar.hidden = false;
    subbar.hidden = false;
    syncSortUI();
    updateBlockWarning(data.gateway_ip);

    render();
    if (!auto) toast(`${devices.length} aparelho(s) na rede.`);
  } catch (e) {
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

/* ---------------- render ---------------- */
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

function updateCounts() {
  const c = counts();
  $("#cAll").textContent = c.all;
  $("#cKnown").textContent = c.known;
  $("#cUnknown").textContent = c.unknown;
  $("#cBlocked").textContent = c.blocked;
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
  else /* mac */ { av = a.mac || ""; bv = b.mac || ""; }
  if (av < bv) return -1 * dir;
  if (av > bv) return 1 * dir;
  return ipNum(a.ip) - ipNum(b.ip);   // desempate estável por IP
}

function render() {
  updateCounts();
  if (!devices.length) { showOnly(empty); return; }

  const shown = devices.filter(matches).sort(compare);
  if (!shown.length) { showOnly(noResults); return; }

  list.innerHTML = "";
  const tpl = $("#rowTpl");
  for (const d of shown) list.appendChild(buildRow(d, tpl));

  showOnly(list);
  listHead.hidden = false;
}

function buildRow(d, tpl) {
  const isSelf = d.ip === localIp;
  const node = tpl.content.cloneNode(true);
  const li = node.querySelector(".device");
  const state = stateOf(d);

  li.classList.add(state);
  li.dataset.mac = d.mac;
  li.dataset.ip = d.ip;

  const nameInput = node.querySelector(".name-input");
  nameInput.value = d.name || "";
  node.querySelector(".hostname").textContent =
    isSelf ? "Este computador" : (d.hostname || "Nome não divulgado");
  node.querySelector(".vendor").textContent = d.vendor || "Fabricante desconhecido";
  node.querySelector(".ip").textContent = d.ip;
  node.querySelector(".mac").textContent = d.mac;

  const knownBtn = node.querySelector(".btn-known");
  const blockBtn = node.querySelector(".btn-block");

  if (isSelf) {
    nameInput.disabled = true;
    nameInput.placeholder = "";
    node.querySelector(".actions").innerHTML = '<span class="self-tag">Você</span>';
    return node;
  }

  if (d.status === "known") knownBtn.classList.add("active");
  if (d.blocked) { blockBtn.classList.add("active"); blockBtn.textContent = "Desbloquear"; }

  // bloqueio indisponível (roteador não resolvido): botão inerte, só pra alvos ainda não bloqueados
  if (!canBlock && !d.blocked) {
    blockBtn.disabled = true;
    blockBtn.classList.add("na");
    blockBtn.title = "Bloqueio indisponível: não consegui resolver o MAC do roteador.";
  }

  nameInput.addEventListener("change", () => {
    d.name = nameInput.value;
    label(d.mac, { name: nameInput.value });
  });

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

/* ---------------- bloqueio (com confirmação em 2 passos) ---------------- */
let confirmTimer;
function onBlockClick(li, btn, d) {
  const isBlocked = li.classList.contains("blocked");

  if (isBlocked) { toggleBlock(li, btn, d, false); return; }

  // 1º clique arma a confirmação; 2º clique executa
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
    const url = wantBlock ? "/api/block" : "/api/unblock";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac: d.mac, ip: d.ip }),
    });
    const data = await res.json();
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
    await fetch("/api/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac, ...fields }),
    });
  } catch (_) { /* silencioso: apelido é secundário */ }
}

/* ---------------- helpers de estado ---------------- */
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
