// Descarga el TCO del BCB y escribe tc.json (lo ejecuta GitHub Actions cada 3 horas).
import { readFile, writeFile } from "node:fs/promises";
import { parsearBCB } from "./parser.mjs";

const FUENTE = "https://www.bcb.gob.bo/librerias/indicadores/otras/ultimo.php";
const r = await fetch(FUENTE, { headers: { "user-agent": "catalogo-tc/1.0 (+https://diegodenac.github.io/catalogos/)" } });
if (!r.ok) throw new Error(`BCB respondió ${r.status}`);
const { tco, fecha } = parsearBCB(await r.text());

const destino = new URL("../tc.json", import.meta.url);
let previo = {};
try { previo = JSON.parse(await readFile(destino, "utf8")); } catch { /* primera vez */ }
if (previo.tco === tco && previo.fecha === fecha) {
  console.log(`Sin cambios: ${tco} (${fecha})`);
} else {
  await writeFile(destino, JSON.stringify({ tco, fecha, fuente: "BCB", actualizado: new Date().toISOString() }) + "\n");
  console.log(`Actualizado: ${tco} (${fecha})`);
}
