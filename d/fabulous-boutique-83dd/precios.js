// Lógica pura (sin DOM) para poder probarla con Node.

// Parser CSV con soporte de comillas, comas y saltos de línea dentro de campos.
export function parsearCSV(texto) {
  const filas = [];
  let fila = [], campo = "", enComillas = false;
  texto = texto.replace(/^﻿/, "");
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"' && campo === "") enComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  const datos = filas.filter((f) => f.some((v) => v.trim() !== ""));
  if (!datos.length) return [];
  const cab = datos[0].map((h) => h.trim().toLowerCase());
  return datos.slice(1).map((f) => Object.fromEntries(cab.map((h, i) => [h, (f[i] ?? "").trim()])));
}

export function aNumero(v) {
  if (v == null) return NaN;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  // "1.234,50" -> 1234.50 ; "1,234.50" -> 1234.50 ; "12,5" -> 12.5
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) s = s.replace(",", ".");
  return s === "" ? NaN : Number(s);
}

const SI = new Set(["si", "sí", "s", "1", "true", "x", "yes"]);
export const esSi = (v) => SI.has(String(v ?? "").trim().toLowerCase());

// Separa la fila especial __TC__ (TC propio del negocio) del resto de productos.
export function normalizarProductos(filas) {
  let tcPropio = null;
  const productos = [];
  for (const f of filas) {
    if ((f.codigo || "").toUpperCase() === "__TC__") {
      const n = aNumero(f.precio);
      if (n > 0) tcPropio = n;
      continue;
    }
    const precio = aNumero(f.precio);
    if (!f.nombre || !(precio >= 0)) continue;
    productos.push({
      codigo: f.codigo || "",
      nombre: f.nombre,
      categoria: f.categoria || "Otros",
      precio,
      moneda: (f.moneda || "BOB").toUpperCase().startsWith("U") ? "USD" : "BOB",
      imagen: f.imagen || "",
      descripcion: f.descripcion || "",
      disponible: f.disponible === undefined || f.disponible === "" ? true : esSi(f.disponible),
      destacado: esSi(f.destacado),
    });
  }
  return { productos, tcPropio };
}

// Decide qué TC aplicar. Prioridad: TC propio de la planilla > modo "propio" en config > oficial BCB (+recargo) > respaldo.
export function resolverTC(cfgTC = {}, tcPropioPlanilla, oficial) {
  const recargo = Number(cfgTC.recargoPct) || 0;
  if (tcPropioPlanilla > 0) return { valor: tcPropioPlanilla, origen: "negocio" };
  if (cfgTC.modo === "propio" && cfgTC.propio > 0) return { valor: cfgTC.propio, origen: "negocio" };
  if (oficial && oficial.tco > 0) {
    return { valor: oficial.tco * (1 + recargo / 100), origen: "oficial", base: oficial.tco, fecha: oficial.fecha, recargo };
  }
  return { valor: (Number(cfgTC.respaldo) || 0) * (1 + recargo / 100), origen: "respaldo", recargo };
}

// Redondea hacia arriba al múltiplo indicado (protege el margen del comerciante).
export function redondear(monto, paso = 1) {
  if (!(paso > 0)) return Math.round(monto * 100) / 100;
  return Math.ceil(Math.round((monto / paso) * 1e6) / 1e6) * paso;
}

export function precioBs(prod, tc, paso = 1) {
  const base = prod.moneda === "USD" ? prod.precio * tc : prod.precio;
  return redondear(base, paso);
}

export function formatoBs(n) {
  const dec = Number.isInteger(n) ? 0 : 2;
  return "Bs " + n.toLocaleString("es-BO", { minimumFractionDigits: dec, maximumFractionDigits: 2 });
}

export function mensajePedido({ negocio, items, total, cliente, tc }) {
  const lineas = items.map((it) => `• ${it.cant} x ${it.nombre}${it.codigo ? ` (${it.codigo})` : ""} — ${formatoBs(it.subtotal)}`);
  return [
    `Hola ${negocio}, quiero hacer este pedido:`,
    "",
    ...lineas,
    "",
    `*Total: ${formatoBs(total)}*`,
    tc ? `(TC aplicado: ${tc.toFixed(2)})` : "",
    cliente ? `Nombre: ${cliente}` : "",
  ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim();
}
