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

// Diccionario grande (para validar)
const DICT_VALIDACION_PATH = path.join(__dirname, "diccionario_es_sin_tildes.txt");

// Diccionario con tildes (solo para mostrar bonito)
const DICT_TILDES_PATH = path.join(__dirname, "diccionario_es_con_tildes.txt");

// Cache
let DICCIONARIO_SET = null;
// Mapa opcional si el diccionario incluye tildes (si no, quedará casi vacío)
let MAPA_TILDES = new Map();

// -------------------- UTILIDADES --------------------
function normaliza(p = "") {
  return (p || "").toString().trim().toLowerCase();
}

// Para claves: sin tildes (pero NO borra ñ)
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
// -------------------- FAMILIAS (ANTI-REPETICIÓN) --------------------
// Heurística simple (pero efectiva) para “familia” de palabra.
// No es lingüística perfecta, pero evita repeticiones tipo: eco/ecos, cantar/cantando, etc.
function familiaKey(p = "") {
  let w = sinTildes(normaliza(p)).trim();
  if (!w) return "";

  // 1) solo letras (y ñ por si acaso)
  w = w.replace(/[^a-zñ]/g, "");

  // 2) plurales rápidos
  if (w.endsWith("es") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && w.length > 3) w = w.slice(0, -1);

  // 3) sufijos muy comunes (muy conservador)
  const sufijos = [
    "mente", "ciones", "cion", "siones", "sion",
    "amientos", "amiento", "imientos", "imiento",
    "adoras", "ador", "adora", "adores",
    "ancias", "ancia", "encias", "encia",
    "idades", "idad",
    "itos", "itas", "ito", "ita",
    "illos", "illas", "illo", "illa",
    "ando", "iendo", "ados", "adas", "ado", "ada",
    "ar", "er", "ir"
  ];

  for (const suf of sufijos) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      w = w.slice(0, -suf.length);
      break;
    }
  }

  // 4) clave estable (recorte para no ser demasiado estrictos)
  if (w.length > 6) w = w.slice(0, 6);

  return w;
}

function familiasUsadas({ palabraMaquina, palabraUsuario, historial }) {
  const usados = new Set();

  const mete = (x) => {
    const k = familiaKey(x);
    if (k) usados.add(k);
  };

  mete(palabraMaquina);
  mete(palabraUsuario);

  for (const h of (historial || [])) mete(h);

  return usados;
}

// Normalización robusta PARA DICCIONARIO SIN perder la ñ
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

// ¿Tiene tildes españolas?
function tieneTildesES(w = "") {
  return /[áéíóúü]/i.test(w);
}

/**
 * Limpieza FUERTE de palabra de IA para validar y comparar:
 * - 1 palabra
 * - minúscula
 * - sin diacríticos raros
 * - solo letras y ñ
 */
function limpiaPalabraIA(str = "") {
  return normalizaParaDiccionario(str) || "bruma";
}

// -------------------- TILDES (SALIDA BONITA) --------------------
// Si tu diccionario NO tiene tildes, esto te lo arregla igualmente:
const TILDES_OVERRIDE = new Map([
  ["melodia", "melodía"],
  ["vacio", "vacío"],
  ["circulo", "círculo"],
  ["metafora", "metáfora"],
  ["raices", "raíces"],
  ["umbria", "umbría"],
  ["credito", "crédito"],
  ["musica", "música"],
  ["arbol", "árbol"],
  ["corazon", "corazón"],
  ["camion", "camión"],
  ["tambien", "también"],
  ["despues", "después"],
  ["ademas", "además"],
  ["cancion", "canción"],
  ["accion", "acción"],
  ["atencion", "atención"],
  ["decision", "decisión"],
  ["informacion", "información"],
  ["comunicacion", "comunicación"],
  ["situacion", "situación"],
  ["tradicion", "tradición"],
  ["revolucion", "revolución"],
  ["solucion", "solución"],
  ["evolucion", "evolución"],
  ["intuicion", "intuición"],
  ["ilusion", "ilusión"],
  ["emocion", "emoción"],
  ["pasion", "pasión"],
  ["vision", "visión"],
  ["mision", "misión"],
  ["razon", "razón"],
  ["condicion", "condición"],
  ["relacion", "relación"],
  ["conexion", "conexión"],
  ["meditacion", "meditación"],
  ["respiracion", "respiración"],
  ["percepcion", "percepción"],
  ["imaginacion", "imaginación"],
  ["creacion", "creación"],
  ["inspiracion", "inspiración"],
  ["sanacion", "sanación"],
  ["liberacion", "liberación"],
  ["aceptacion", "aceptación"],
  ["comprension", "comprensión"],
  ["compasion", "compasión"],
  ["reflexion", "reflexión"],
  ["expresion", "expresión"],
  ["transformacion", "transformación"],
  ["conversacion", "conversación"],
  ["cuestion", "cuestión"],
  ["opcion", "opción"],
  ["facil", "fácil"],
  ["dificil", "difícil"],
  ["util", "útil"],
  ["agil", "ágil"],
  ["debil", "débil"],
  ["fragil", "frágil"],
  ["docil", "dócil"],
  ["practico", "práctico"],
  ["teorico", "teórico"],
  ["logica", "lógica"],
  ["clasico", "clásico"],
  ["unico", "único"],
  ["publico", "público"],
  ["tecnico", "técnico"],
  ["poetico", "poético"],
  ["terapeutico", "terapéutico"],
  ["sistemico", "sistémico"],
  ["intimo", "íntimo"],
  ["rapido", "rápido"],
  ["proximo", "próximo"],
  ["ultimo", "último"],
  ["minimo", "mínimo"],
  ["maximo", "máximo"],
  ["basico", "básico"],
  ["magico", "mágico"],
  ["elastico", "elástico"],
  ["organico", "orgánico"],
  ["simbolo", "símbolo"],
  ["heroe", "héroe"],
  ["angel", "ángel"],
  ["oceano", "océano"],
  ["volcan", "volcán"],
  ["jardin", "jardín"],
  ["limon", "limón"],
  ["melon", "melón"],
  ["cafe", "café"],
  ["tunel", "túnel"],
  ["lapiz", "lápiz"],
  ["pajaro", "pájaro"],
  ["carcel", "cárcel"],
  ["azucar", "azúcar"],
  ["pagina", "página"],
  ["sabado", "sábado"],
  ["miercoles", "miércoles"],
  ["aritmetica", "aritmética"],
  ["neurologia", "neurología"],
  ["filosofia", "filosofía"],
  ["psicologia", "psicología"],
  ["biologia", "biología"],
]);


/**
 * Devuelve la palabra “bonita” para pantalla:
 * 1) override (lo que tú mandas)
 * 2) mapa del diccionario (si existe)
 * 3) palabra tal cual
 */
function aplicaTildesSalida(palabra = "") {
  const base = (palabra || "").toString().trim();
  const key = sinTildes(normaliza(base));
  if (!key) return base;

  return TILDES_OVERRIDE.get(key) || MAPA_TILDES.get(key) || base;
}

// -------------------- DICCIONARIO --------------------
async function cargaDiccionario() {
  if (DICCIONARIO_SET) return DICCIONARIO_SET;

  try {
    // 1) Cargar diccionario grande SIN tildes (validación)
    const rawValid = await fs.readFile(DICT_VALIDACION_PATH, "utf-8");
    const set = new Set();

    for (const line of rawValid.split(/\r?\n/)) {
      const w = normalizaParaDiccionario(line);
      if (w) set.add(w);
    }

    // 2) Cargar diccionario CON tildes (visual) -> MAPA_TILDES
    const rawTildes = await fs.readFile(DICT_TILDES_PATH, "utf-8");
    const mapa = new Map();

    for (const line of rawTildes.split(/\r?\n/)) {
      const original = (line || "").trim();
      if (!original) continue;

      const key = sinTildes(normaliza(original)); // clave sin tildes
      if (!key) continue;

      const prev = mapa.get(key);
      if (!prev) {
        mapa.set(key, original);
      } else {
        // Preferimos la versión con tilde si hay conflicto
        const prevTiene = tieneTildesES(prev);
        const curTiene = tieneTildesES(original);
        if (!prevTiene && curTiene) {
          mapa.set(key, original);
        }
      }
    }

    DICCIONARIO_SET = set;
    MAPA_TILDES = mapa;

    console.log(`✅ Diccionario validación: ${set.size} palabras (${path.basename(DICT_VALIDACION_PATH)})`);
    console.log(`✅ Diccionario tildes: ${MAPA_TILDES.size} entradas (${path.basename(DICT_TILDES_PATH)})`);

    return set;
  } catch (e) {
    console.error(
      "❌ No pude cargar diccionarios. Revisa que estén junto a index.js y con estos nombres:\n" +
        "- diccionario_es_sin_tildes.txt\n" +
        "- diccionario_es_con_tildes.txt\n" +
        "Error:",
      e?.message || e
    );

    DICCIONARIO_SET = new Set();
    MAPA_TILDES = new Map();
    return DICCIONARIO_SET;
  }
}


function esValidaEnDiccionario(palabra) {
  if (!DICCIONARIO_SET || DICCIONARIO_SET.size === 0) return false;
  const w = normalizaParaDiccionario(palabra);
  return w && DICCIONARIO_SET.has(w);
}

// -------------------- SIMILITUD / SCORE --------------------
function similitudLetras(a, b) {
  const sa = new Set(a.split(""));
  const sb = new Set(b.split(""));
  const inter = [...sa].filter((ch) => sb.has(ch)).length;
  const union = new Set([...sa, ...sb]).size || 1;
  return inter / union;
}

function calculaScoreFinal({ hay_hilo, fuerza_hilo, palabraMaquina, palabraUsuario }) {
  const a = sinTildes(normaliza(palabraMaquina));
  const b = sinTildes(normaliza(palabraUsuario));
  if (!a || !b) return 0;
  if (a === b) return 1;

  const sim = similitudLetras(a, b);
  // Penalización fuerte por sinonimia o cercanía excesiva
if (sim > 0.65) {
  // aunque la IA diga que hay hilo, lo limitamos
  return Math.min(4, Math.round(Number(fuerza_hilo ?? 3)));
}


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

// -------------------- PROMPT --------------------
const systemPrompt = `
Eres SUTILIA: una voz interior sabia, clara y honesta.
No complaces, no adornas lo obvio, no inflas conexiones simples.

TAREA:
- Decide si hay un hilo REAL entre dos palabras.
- Diferencia con claridad:
  • Sinónimo o relación literal → hilo débil.
  • Relación metafórica, simbólica o experiencial → hilo real.
- Si NO hay hilo: dilo con verdad, sin inventar puentes.
- Si el vínculo es obvio o directo (sinónimos, misma idea): 
  → hay hilo, pero su fuerza debe ser BAJA.

VALORACIÓN DE FUERZA (0–10):
- 0–2 → no hay hilo o es forzado
- 3–4 → relación literal o sinónima
- 5–6 → relación comprensible pero poco sutil
- 7–8 → relación simbólica o metafórica clara
- 9 → conexión poética profunda (rara)
- 10 → conexión excepcional y transformadora (muy rara)

REGLAS IMPORTANTES:
- Los sinónimos NUNCA pueden puntuar por encima de 4.
- Las conexiones evidentes no son sutileza.
- La sutileza nace del desplazamiento, no de la repetición.

PALABRA NUEVA:
- Propón UNA sola palabra.
- Correcta en español, común y reconocible.
- Evita repetir palabras ya usadas o de la misma familia.
- Abre un camino nuevo, no obvio.

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

async function generaNuevaPalabraValida({ palabraMaquina, palabraUsuario, historial }) {
  const usadosFamilia = familiasUsadas({ palabraMaquina, palabraUsuario, historial });

  // Reintenta “hasta conseguirlo” (con red de seguridad para no quemar tokens/coste)
  const MAX_INTENTOS = 25;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const ia = await generaRespuestaIA(palabraMaquina, palabraUsuario, historial);

    // 1) candidata limpia + válida en diccionario
    const cand = limpiaPalabraIA(ia.nueva_palabra);
    if (!esValidaEnDiccionario(cand)) continue;

    // 2) familia (anti-repetición)
    const fam = familiaKey(cand);
    if (!fam) continue;
    if (usadosFamilia.has(fam)) continue;

    // OK: devolvemos IA pero con palabra ya “limpia”
    ia.nueva_palabra = cand;
    return ia;
  }

  // Si la IA se atasca muchísimo: fallback seguro (raro)
  const ia = await generaRespuestaIA(palabraMaquina, palabraUsuario, historial);
  ia.nueva_palabra = palabraSemillaAleatoria();
  ia.hay_hilo = false;
  ia.fuerza_hilo = 2;
  ia.explicacion =
    "He evitado repetir familias para que el hilo tenga variedad. Prueba otra palabra y seguimos.";
  return ia;
}


// -------------------- ENDPOINTS --------------------
app.get("/ping", (req, res) => res.send("pong"));

app.get("/seed", (req, res) => {
  // devolvemos semilla “bonita” (si hay override, sale con tilde)
  res.json({ palabra: aplicaTildesSalida(palabraSemillaAleatoria()) });
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
        nueva_palabra: aplicaTildesSalida(pm),
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
      nueva_palabra:
  TILDES_OVERRIDE.get(sinTildes(ia.nueva_palabra)) ||
  MAPA_TILDES.get(sinTildes(ia.nueva_palabra)) ||
  ia.nueva_palabra,

      hay_hilo: ia.hay_hilo,
    });
  } catch (err) {
    console.error("Error en /jugar:", err);
    res.status(500).json({
      puntuacion: 0,
      explicacion: "Ahora mismo hay ruido en la conexión. Vuelve a intentarlo en unos segundos.",
      nueva_palabra: aplicaTildesSalida("bruma"),
      hay_hilo: false,
    });
  }
});

// -------------------- ARRANQUE --------------------
const PORT = process.env.PORT || 3000;
await cargaDiccionario();

app.listen(PORT, () => console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`));
