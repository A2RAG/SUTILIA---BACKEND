import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json());
app.use(cors());

// -------------------- OPENAI --------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Usa un modelo que exista en tu cuenta.
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

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
 * Limpieza "correcta en español" para palabra IA:
 * - 1 sola palabra
 * - minúsculas
 * - permite áéíóúüñ (NO las borra)
 * - convierte diacríticos NO españoles a letras base (ö->o, ê->e, ç->c, etc.)
 * - si no queda una palabra válida -> "bruma"
 */
function limpiaPalabraIA(str = "") {
  let w = (str || "").toString().trim().toLowerCase().split(/\s+/)[0] || "";

  // 1) Convertimos diacríticos NO españoles a su vocal base
  // (pero mantenemos áéíóúüñ tal cual)
  w = w
    .replace(/[àâäãåāăą]/g, "a")
    .replace(/[èêëēĕėęě]/g, "e")
    .replace(/[ìîïīĭį]/g, "i")
    .replace(/[òôöõōŏő]/g, "o")
    .replace(/[ùûūŭůűų]/g, "u");

  // 2) Quitamos SOLO diacríticos combinados raros
  // (si viniesen como marcas sueltas)
  w = w.normalize("NFD").replace(/\p{Mn}+/gu, "").normalize("NFC");

  // 3) Permitimos solo letras españolas
  w = w.replace(/[^a-záéíóúüñ]/g, "");

  // 4) Si queda vacío, fallback
  return w || "bruma";
}


/**
 * Regla de puntuación (endurecida):
 * - Si NO hay hilo: máximo 2
 * - Si SÍ hay hilo: viene de fuerza_hilo 0..10, pero el 9/10 son raros
 */
function calculaScoreFinal({ hay_hilo, fuerza_hilo, palabraMaquina, palabraUsuario }) {
  const a = sinTildes(normaliza(palabraMaquina));
  const b = sinTildes(normaliza(palabraUsuario));
  if (!a || !b) return 0;
  if (a === b) return 1;

  const sim = similitudLetras(a, b);

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

// -------------------- PALABRAS SEMILLA (BONITAS + CORRECTAS) --------------------
const PALABRAS_SEMILLA = [
  "bruma",
  "orilla",
  "invierno",
  "latido",
  "deriva",
  "umbría",
  "faro",
  "vacío",
  "círculo",
  "marea",
  "trama",
  "lazo",
  "umbral",
  "raíces",
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
Eres SUTILIA: una voz interior sabia, amable y firme.
No juzgas, no gritas, no complacés. Si no hay hilo, lo dices con claridad.

REGLAS:
- Escribe SIEMPRE en español correcto, con tildes bien puestas.
- NO uses anglicismos ni palabras inventadas.

TAREA:
- Decide si hay un hilo REAL entre dos palabras.
- Si NO hay hilo: dilo con claridad, sin inventar puentes.
- Si SÍ hay hilo: explica el hilo en 2–4 frases claras y poéticas.
- Devuelve "fuerza_hilo" (0 a 10) siendo 9 y 10 MUY raros.
- Propón UNA sola palabra nueva, real en español, con tildes correctas si procede.

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
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] },
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

    const ia = await generaRespuestaIA(pm, pu, historial);

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
      nueva_palabra: ia.nueva_palabra,
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
app.listen(PORT, () => console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`));
