import express from "express";
import cors from "cors";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());
app.use(cors());

// -------------------- OPENAI --------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Usa un modelo que exista en tu cuenta.
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// -------------------- RUTAS / DICCIONARIO --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pon aquí el diccionario “igual que Android”
const DICT_PATH = path.join(__dirname, "diccionario_es.txt");

// Cargamos una vez y cacheamos
let DICCIONARIO_SET = null;

// Normalización robusta SIN perder la ñ
function normalizaParaDiccionario(str = "") {
  let s = (str || "").toString().trim().toLowerCase();
  if (!s) return "";

  // Protegemos ñ antes de quitar diacríticos
  s = s.replace(/ñ/g, "__enie__");

  // Quita diacríticos (áéíóúü etc)
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Recupera ñ
  s = s.replace(/__enie__/g, "ñ");

  // 1 sola palabra
  s = s.split(/\s+/)[0] || "";

  // Solo letras a-z y ñ
  s = s.replace(/[^a-zñ]/g, "");

  return s;
}

async function cargaDiccionario() {
  if (DICCIONARIO_SET) return DICCIONARIO_SET;

  try {
    const raw = await fs.readFile(DICT_PATH, "utf-8");
    const set = new Set();

    for (const line of raw.split(/\r?\n/)) {
      const w = normalizaParaDiccionario(line);
      if (w) set.add(w);
    }

    DICCIONARIO_SET = set;
    console.log(`✅ Diccionario cargado: ${set.size} palabras (${path.basename(DICT_PATH)})`);
    return set;
  } catch (e) {
    console.error(
      `❌ No pude cargar ${path.basename(DICT_PATH)}. ` +
      `Crea el archivo junto a index.js con 1 palabra por línea. Error:`,
      e?.message || e
    );
    DICCIONARIO_SET = new Set(); // seguimos con fallback
    return DICCIONARIO_SET;
  }
}

function esValidaEnDiccionario(palabra) {
  if (!DICCIONARIO_SET || DICCIONARIO_SET.size === 0) return false;
  const w = normalizaParaDiccionario(palabra);
  return w && DICCIONARIO_SET.has(w);
}

// -------------------- UTILIDADES --------------------
function normaliza(p = "") {
  return (p || "").toString().trim().toLowerCase();
}

// Para lógica interna (comparaciones): sin tildes
function sinTildes(str = "") {
  return (str || "")
    .toString()
    .toLowerCase()
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u")
    .replace(/ü/g, "u");
}

// Similaridad de letras (simple, barata, estable)
function similitudLetras(a, b) {
  const sa = new Set(a.split(""));
  const sb = new Set(b.split(""));
  const inter = [...sa].filter((ch) => sb.has(ch)).length;
  const union = new Set([...sa, ...sb]).size || 1;
  return inter / union;
}

/**
 * Limpieza FUERTE de palabra generada por IA:
 * - 1 sola palabra
 * - minúsculas
 * - elimina diacríticos raros
 * - permite solo [a-z] y ñ
 */
function limpiaPalabraIA(str = "") {
  // Usamos la misma normalización que para diccionario
  return normalizaParaDiccionario(str) || "bruma";
}

/**
 * Regla de puntuación:
 * - Si NO hay hilo: score máximo 2
 * - Si SÍ hay hilo: score viene de fuerza_hilo 0..10 con endurecimiento
 */
function calculaScoreFinal({ hay_hilo, fuerza_hilo, palabraMaquina, palabraUsuario }) {
  const a = sinTildes(normaliza(palabraMaquina));
  const b = sinTildes(normaliza(palabraUsuario));
  if (!a || !b) return 0;
  if (a === b) return 1;

  const sim = similitudLetras(a, b); // 0..1

  if (!hay_hilo) {
    if (sim > 0.6) return 0;
    if (sim > 0.35) return 1;
    return 2;
  }

  let s = Math.round(Number(fuerza_hilo ?? 5));

  if (s >= 9 && sim > 0.25) s -= 1;
  if (sim > 0.55 && s >= 8) s -= 1;

  if (s < 0) s = 0;
  if (s > 10) s = 10;
  return s;
}

// -------------------- PALABRAS SEMILLA --------------------
const PALABRAS_SEMILLA = [
  "bruma",
  "orilla",
  "invierno",
  "latido",
  "deriva",
  "umbria",
  "faro",
  "vacio",
  "circulo",
  "marea",
  "trama",
  "lazo",
  "umbral",
  "raices",
  "eco",
  "claridad",
  "susurro",
  "memoria",
  "pulso",
];

function palabraSemillaAleatoria() {
  return PALABRAS_SEMILLA[Math.floor(Math.random() * PALABRAS_SEMILLA.length)];
}

/**
 * Evita repetir palabras ya usadas (comparación sin tildes)
 */
function siguientePalabraEvitaRepetir({ propuesta, palabraMaquina, palabraUsuario, historial }) {
  const usados = new Set(
    [palabraMaquina, palabraUsuario, ...(historial || [])]
      .map((x) => sinTildes(normaliza(x)))
      .filter(Boolean)
  );

  let cand = limpiaPalabraIA(propuesta);
  const candKey = sinTildes(cand);

  if (usados.has(candKey)) {
    for (let i = 0; i < 30; i++) {
      const alt = palabraSemillaAleatoria();
      if (!usados.has(sinTildes(alt))) return alt;
    }
    return "bruma";
  }

  return cand;
}

// -------------------- PROMPT (VOZ SABIA, FIRME) --------------------
const systemPrompt = `
Eres SUTILIA: una voz interior sabia, amable y firme.
No juzgas, no gritas, no complacés. Si no hay hilo, lo dices con claridad y verdad.

TAREA:
- Decide si hay un hilo REAL entre dos palabras (semántico, simbólico o experiencial).
- Si NO hay hilo: di "no hay hilo" sin inventar puentes.
- Si SÍ hay hilo: explica el hilo en 2–4 frases claras y poéticas (comprensibles).
- Devuelve "fuerza_hilo" de 0 a 10:
    0–2: prácticamente no hay hilo
    3–5: hilo débil
    6–8: hilo real y sutil
    9: hilo brillante (raro)
    10: hilo excepcional (muy raro; sólo si la conexión es sorprendente y coherente)
- Propón UNA sola palabra nueva (una palabra), correcta en español, común y reconocible.
  Evita palabras inventadas, extranjerismos y rarezas ortográficas.
  Debe abrir un camino no obvio, con sentido e intención, y evitar repetir palabras ya usadas.

RESPONDE SIEMPRE en JSON válido, SIN texto extra, con EXACTAMENTE estas claves:
{
  "hay_hilo": true|false,
  "fuerza_hilo": 0-10,
  "explicacion": "string",
  "nueva_palabra": "string"
}
`;

// -------------------- IA --------------------
async function generaRespuestaIA(palabraMaquina, palabraUsuario, historial = []) {
  const payload = { palabraMaquina, palabraUsuario, historial };

  const response = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(payload) }],
      },
    ],
    max_output_tokens: 350,
  });

  const raw = (response.output_text || "").trim();

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("JSON IA inválido. Texto recibido:", raw);
    json = {
      hay_hilo: false,
      fuerza_hilo: 1,
      explicacion: "Ahora mismo no puedo leer el hilo. Respira y prueba otra palabra.",
      nueva_palabra: "bruma",
    };
  }

  const hay_hilo = !!json.hay_hilo;

  let fuerza_hilo = Number(json.fuerza_hilo);
  if (!Number.isFinite(fuerza_hilo)) fuerza_hilo = hay_hilo ? 5 : 1;
  fuerza_hilo = Math.max(0, Math.min(10, Math.round(fuerza_hilo)));

  let explicacion = typeof json.explicacion === "string" ? json.explicacion.trim() : "";
  if (!explicacion) {
    explicacion = hay_hilo
      ? "Hay un hilo, aunque sea fino."
      : "Aquí no encuentro un puente real entre las dos palabras.";
  }

  const propuesta = typeof json.nueva_palabra === "string" ? json.nueva_palabra.trim() : "bruma";

  const nueva_palabra = siguientePalabraEvitaRepetir({
    propuesta,
    palabraMaquina,
    palabraUsuario,
    historial,
  });

  return { hay_hilo, fuerza_hilo, explicacion, nueva_palabra };
}

/**
 * Pide a la IA una palabra nueva hasta que sea válida en tu diccionario.
 * - 2 intentos extra
 * - si falla: semilla segura
 */
async function generaNuevaPalabraValida({ palabraMaquina, palabraUsuario, historial }) {
  // 1) respuesta normal
  let ia = await generaRespuestaIA(palabraMaquina, palabraUsuario, historial);
  let cand = ia.nueva_palabra;

  if (esValidaEnDiccionario(cand)) return ia;

  // 2) reintentos cortos
  for (let i = 0; i < 2; i++) {
    ia = await generaRespuestaIA(palabraMaquina, palabraUsuario, historial);
    cand = ia.nueva_palabra;
    if (esValidaEnDiccionario(cand)) return ia;
  }

  // 3) fallback absoluto
  ia.nueva_palabra = palabraSemillaAleatoria();
  return ia;
}

// -------------------- ENDPOINTS --------------------
app.get("/ping", (req, res) => res.send("pong"));

app.get("/seed", (req, res) => {
  res.json({ palabra: palabraSemillaAleatoria() });
});

app.post("/jugar", async (req, res) => {
  try {
    const { palabraMaquina, palabraUsuario, historial = [] } = req.body || {};

    const pm = normaliza(palabraMaquina) || palabraSemillaAleatoria();
    const pu = normaliza(palabraUsuario);

    if (!pu) {
      return res.status(400).json({
        puntuacion: 0,
        explicacion: "Necesito tu palabra para poder escuchar el hilo.",
        nueva_palabra: pm,
        hay_hilo: false,
      });
    }

    const ia = await generaNuevaPalabraValida({
      palabraMaquina: pm,
      palabraUsuario: pu,
      historial,
    });

    const puntuacion = calculaScoreFinal({
      hay_hilo: ia.hay_hilo,
      fuerza_hilo: ia.fuerza_hilo,
      palabraMaquina: pm,
      palabraUsuario: pu,
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({
      puntuacion,
      explicacion: ia.explicacion,
      nueva_palabra: ia.nueva_palabra, // ya validada (o seed fallback)
      hay_hilo: ia.hay_hilo,
    });
  } catch (err) {
    console.error("Error en /jugar:", err);
    res.status(500).json({
      puntuacion: 0,
      explicacion: "Ahora mismo hay ruido en la conexión. Vuelve a intentarlo en unos segundos.",
      nueva_palabra: "bruma",
      hay_hilo: false,
    });
  }
});

// -------------------- ARRANQUE --------------------
const PORT = process.env.PORT || 3000;

// Cargamos diccionario antes de escuchar (para que ya esté listo)
await cargaDiccionario();

app.listen(PORT, () => console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`));
