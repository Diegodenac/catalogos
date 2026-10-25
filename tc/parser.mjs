// Copia del parser de catalogo/worker-tc/src/index.js (mantener sincronizado).
const MESES = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};

export function parsearBCB(html) {
  const filaUSD = html.match(/<td>\s*ESTADOS UNIDOS\s*<\/td>[\s\S]*?<td class="numero">\s*([\d.,]+)\s*<\/td>/i);
  if (!filaUSD) throw new Error("No se encontró la fila USD en la tabla del BCB");
  const tco = Number(filaUSD[1].replace(",", "."));
  if (!(tco > 1 && tco < 100)) throw new Error(`TCO fuera de rango: ${filaUSD[1]}`);

  let fecha = null;
  const f = html.match(/FECHA DE LA COTIZACI[^:]*:[\s\S]*?<strong>\s*(\d{1,2}) de (\w+) (\d{4})\s*<\/strong>/i);
  if (f && MESES[f[2].toLowerCase()]) {
    fecha = `${f[3]}-${MESES[f[2].toLowerCase()]}-${f[1].padStart(2, "0")}`;
  }
  return { tco, fecha };
}
