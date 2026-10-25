import { parsearCSV, normalizarProductos, resolverTC, precioBs, formatoBs, mensajePedido } from "./precios.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const leerLS = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

const estado = { cfg: null, productos: [], tc: null, cat: "Todos", q: "", carro: {} };

async function obtenerJSON(url, ms = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function cargarProductos(cfg) {
  const url = cfg.planillaCsvUrl || "productos.csv";
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const texto = await r.text();
    guardarLS("prod:" + url, texto);
    return texto;
  } catch {
    const copia = leerLS("prod:" + url);
    if (copia) return copia;
    throw new Error("No se pudo cargar la lista de productos");
  }
}

async function cargarOficial(cfg) {
  if (!cfg.tc?.endpoint) return null;
  try {
    const d = await obtenerJSON(cfg.tc.endpoint);
    if (d && d.tco > 0) { guardarLS("tc-oficial", d); return d; }
  } catch { /* usamos la última copia conocida */ }
  return leerLS("tc-oficial");
}

function aplicarMarca(cfg) {
  document.title = cfg.nombre + " · Catálogo";
  $("#nombre").textContent = cfg.nombre;
  $("#lema").textContent = cfg.lema || "";
  if (cfg.logo) { $("#logo").src = cfg.logo; $("#logo").hidden = false; }
  if (cfg.colorPrincipal) {
    document.documentElement.style.setProperty("--pri", cfg.colorPrincipal);
    document.querySelector('meta[name="theme-color"]').content = cfg.colorPrincipal;
  }
  if (cfg.demo) {
    const av = $("#aviso-demo");
    av.textContent = `DEMO preparada para ${cfg.demoPara || cfg.nombre}: productos y precios de ejemplo. No es la tienda oficial del negocio.`;
    av.hidden = false;
  }
  if (!cfg.whatsapp) {
    // Demo sin número: no se abre WhatsApp; se muestra cómo llegaría el pedido.
    $("#btn-wa").hidden = true;
    $("#carro-pedir").textContent = "Ver pedido";
    $("#dlg-pedir").textContent = "Ver cómo llega el pedido";
  } else {
    $("#btn-wa").href = `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent("Hola, vi su catálogo y tengo una consulta.")}`;
  }
  $("#info").innerHTML = [cfg.direccion, cfg.horario].filter(Boolean).map(esc).join(" · ");
}

function pintarTC() {
  const tc = estado.tc;
  const el = $("#tc");
  if (estado.cfg.ocultarTC) { el.hidden = true; return; }
  if (tc.origen === "oficial") {
    const f = tc.fecha ? tc.fecha.split("-").reverse().join("/") : "hoy";
    el.innerHTML = `Precios en Bs al tipo de cambio oficial BCB del ${esc(f)}: <strong>${tc.base.toFixed(2)}</strong>`
      + (tc.recargo ? ` <span class="sub">(+${tc.recargo}%)</span>` : "");
  } else if (tc.origen === "negocio") {
    el.innerHTML = `Precios en Bs al tipo de cambio del negocio: <strong>${tc.valor.toFixed(2)}</strong>`;
  } else {
    el.innerHTML = `Precios en Bs calculados a TC <strong>${tc.valor.toFixed(2)}</strong>`;
  }
}

function pintarCategorias() {
  const cats = ["Todos", ...new Set(estado.productos.map((p) => p.categoria))];
  $("#cats").innerHTML = cats.map((c) => `<button type="button" role="tab" aria-selected="${c === estado.cat}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
}

function iniciales(nombre) {
  return nombre.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

function filtrados() {
  const q = estado.q.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return estado.productos.filter((p) => {
    if (estado.cat !== "Todos" && p.categoria !== estado.cat) return false;
    if (!q) return true;
    const t = (p.nombre + " " + p.codigo + " " + p.descripcion + " " + p.categoria).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return q.split(/\s+/).every((w) => t.includes(w));
  });
}

function controlCantidad(p) {
  const i = esc(p.id);
  const n = estado.carro[p.id] || 0;
  if (!p.disponible) return `<button class="add" disabled>Agotado</button>`;
  if (!n) return `<button class="add" data-add="${i}" type="button">Agregar</button>`;
  return `<div class="stepper"><button data-menos="${i}" type="button" aria-label="Quitar uno">−</button><span>${n}</span><button data-add="${i}" type="button" aria-label="Agregar uno">+</button></div>`;
}

function pintarGrid() {
  const paso = estado.cfg.redondeo ?? 1;
  const lista = filtrados();
  $("#vacio").hidden = lista.length > 0;
  $("#grid").innerHTML = lista.map((p) => {
    const bs = precioBs(p, estado.tc.valor, paso);
    const img = p.imagen
      ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy" />`
      : `<span class="ph" aria-hidden="true">${esc(iniciales(p.nombre))}</span>`;
    const usd = p.moneda === "USD" && estado.cfg.mostrarUSD ? ` <span class="usd">(USD ${p.precio.toFixed(2)})</span>` : "";
    return `<article class="prod">
      <div class="img${p.imagen ? "" : " sin-foto"}">${img}</div>
      <div class="cuerpo">
        ${p.destacado ? `<span class="badge">Destacado</span>` : ""}
        <h3 class="nom">${esc(p.nombre)}</h3>
        ${p.codigo ? `<span class="cod">Cód. ${esc(p.codigo)}</span>` : ""}
        ${p.descripcion ? `<p class="desc">${esc(p.descripcion)}</p>` : ""}
        <div class="precio">${formatoBs(bs)}${usd}</div>
        ${controlCantidad(p)}
      </div>
    </article>`;
  }).join("");
}

function itemsCarro() {
  const porId = new Map(estado.productos.map((p) => [p.id, p]));
  const paso = estado.cfg.redondeo ?? 1;
  return Object.entries(estado.carro).filter(([id, n]) => n > 0 && porId.has(id)).map(([i, cant]) => {
    const p = porId.get(i);
    const unit = precioBs(p, estado.tc.valor, paso);
    return { i, cant, nombre: p.nombre, codigo: p.codigo, unit, subtotal: unit * cant };
  });
}

function pintarCarro() {
  const items = itemsCarro();
  const n = items.reduce((a, it) => a + it.cant, 0);
  const total = items.reduce((a, it) => a + it.subtotal, 0);
  $("#carro").hidden = n === 0;
  $("#carro-n").textContent = n;
  $("#carro-total").textContent = formatoBs(total);
  $("#dlg-total").textContent = formatoBs(total);
  $("#lista-carro").innerHTML = items.map((it) => `<li><span>${it.cant} × ${esc(it.nombre)}</span><span>${formatoBs(it.subtotal)}</span></li>`).join("");
  guardarLS("carro:" + estado.cfg.slug, estado.carro);
}

function enviarPedido() {
  const items = itemsCarro();
  if (!items.length) return;
  const total = items.reduce((a, it) => a + it.subtotal, 0);
  const txt = mensajePedido({
    negocio: estado.cfg.nombre, items, total,
    cliente: $("#cli-nombre").value.trim(),
    tc: estado.cfg.ocultarTC ? null : estado.tc.valor,
  });
  if (!estado.cfg.whatsapp) {
    const v = $("#vista-pedido");
    v.textContent = "Así le llegaría este pedido al negocio por WhatsApp:\n\n" + txt;
    v.hidden = false;
    return;
  }
  window.open(`https://wa.me/${estado.cfg.whatsapp}?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
}

function eventos() {
  $("#buscar").addEventListener("input", (e) => { estado.q = e.target.value; pintarGrid(); });
  $("#cats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    estado.cat = b.dataset.cat; pintarCategorias(); pintarGrid();
  });
  $("#grid").addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]"), m = e.target.closest("[data-menos]");
    if (a) estado.carro[a.dataset.add] = (estado.carro[a.dataset.add] || 0) + 1;
    else if (m) estado.carro[m.dataset.menos] = Math.max(0, (estado.carro[m.dataset.menos] || 0) - 1);
    else return;
    pintarGrid(); pintarCarro();
  });
  const dlg = $("#dlg-carro");
  $("#carro-ver").addEventListener("click", () => dlg.showModal());
  $("#dlg-cerrar").addEventListener("click", () => dlg.close());
  $("#dlg-vaciar").addEventListener("click", () => { estado.carro = {}; pintarGrid(); pintarCarro(); dlg.close(); });
  $("#carro-pedir").addEventListener("click", () => dlg.showModal());
  $("#dlg-pedir").addEventListener("click", enviarPedido);
}

async function iniciar() {
  try {
    const cfg = await obtenerJSON("config.json");
    estado.cfg = cfg;
    aplicarMarca(cfg);
    const [csv, oficial] = await Promise.all([cargarProductos(cfg), cargarOficial(cfg)]);
    const { productos, tcPropio } = normalizarProductos(parsearCSV(csv));
    estado.productos = productos
      .map((p) => ({ ...p, id: p.codigo || p.nombre }))
      .sort((a, b) => Number(b.destacado) - Number(a.destacado));
    const ids = new Set(estado.productos.map((p) => p.id));
    estado.tc = resolverTC(cfg.tc, tcPropio, oficial);
    const guardado = leerLS("carro:" + cfg.slug) || {};
    for (const [i, n] of Object.entries(guardado)) if (ids.has(i) && n > 0) estado.carro[i] = n;
    pintarTC(); pintarCategorias(); pintarGrid(); pintarCarro(); eventos();
  } catch (e) {
    $("#grid").innerHTML = `<p class="vacio">No se pudo cargar el catálogo. Intenta de nuevo en unos minutos.</p>`;
    console.error(e);
  }
}

iniciar();
