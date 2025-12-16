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

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// -------------------- UTILIDADES --------------------
function normaliza(p = "") {
  return (p || "").toString().trim().toLowerCase();
}

// Quita tildes para comparaciones internas (pero NO para mostrar)
// El front ya permite escribir sin tildes; aquí solo normalizamos para lógica.
function sinTildes(str = "") {
  return str
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u")
    .replace(/ü/g, "u");
}

// similitud de letras (simple)
function similitudLetras(a, b) {
  const sa = new Set(a.split(""));
  const sb = new Set(b.split(""));
  const inter = [...sa].filter((ch) => sb.has(ch)).length;
  const union = new Set([...sa, ...sb]).size || 1;
  return inter / union;
}

/**
 * Regla NUEVA de puntuación:
 * - Si NO hay hilo: score máximo 2 (o 3 si quieres) aunque sean “muy diferentes”.
 * - Si SÍ hay hilo: score viene del modelo (0–10) pero lo “endurecemos” un poco.
 */
function calculaScoreFinal({ hay_hilo, fuerza_hilo, palabraMaquina, palabraUsuario }) {
  const a = sinTildes(normaliza(palabraMaquina));
  const b = sinTildes(normaliza(palabraUsuario));
  if (!a || !b) return 0;
  if (a === b) return 1;

  const sim = similitudLetras(a, b); // 0..1

  if (!hay_hilo) {
    // Sin hilo = no hay 8/9/10 jamás
    // Pequeña variación para que no sea siempre 0:
    // si son MUY parecidas (sim alto) => 0 o 1
    // si son muy distintas (sim bajo) => 2
    if (sim > 0.6) return 0;
    if (sim > 0.35) return 1;
    return 2; // máximo sin hilo
  }

  // Con hilo: partimos de fuerza_hilo 0..10
  let s = Math.round(Number(fuerza_hilo ?? 5));

  // Endurecimiento: el 10 tiene que ser raro, y el 9 también
  // (baja 1 punto si es “demasiado fácil” por letras muy similares)
  if (sim > 0.55 && s >= 8) s -= 1;

  // Cap
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
];

function siguientePalabraEvitaRepetir({ propuesta, palabraMaquina, palabraUsuario, historial }) {
  const usados = new Set(
    [palabraMaquina, palabraUsuario, ...(historial || [])]
      .map((x) => sinTildes(normaliza(x)))
      .filter(Boolean)
  );

  let cand = normaliza(propuesta || "");
  if (!cand) cand = "bruma";

  // Mantén tildes/ñ si vienen bien, pero validamos que sea “una palabra”
  cand = cand.split(/\s+/)[0].trim();

  // Si repite, buscamos otra semilla distinta
  const candKey = sinTildes(cand);
  if (usados.has(candKey)) {
    for (let i = 0; i < PALABRAS_SEMILLA.length; i++) {
      const alt = PALABRAS_SEMILLA[Math.floor(Math.random() * PALABRAS_SEMILLA.length)];
      if (!usados.has(sinTildes(alt))) return alt;
    }
    return "bruma";
  }

  return cand;
}

// -------------------- PROMPT (VOZ SABIA, FIRME, NO COMPLACIENTE) --------------------
const systemPrompt = `
Eres SUTILIA: una voz interior sabia, amable y firme.
No juzgas, no gritas, no complacés. Si no hay hilo, lo dices con claridad y verdad.

TAREA:
- Decide si hay un hilo REAL entre dos palabras (semántico, simbólico o experiencial).
- Si NO hay hilo: di "no hay hilo" sin inventar puentes.
- Si SÍ hay hilo: explica el hilo en 2–4 frases claras y poéticas (pero comprensibles).
- Devuelve una puntuación de "fuerza_hilo" de 0 a 10:
    0–2: prácticamente no hay hilo
    3–5: hilo débil, apenas
    6–8: hilo real, sutil
    9: hilo muy fino y brillante (raro)
    10: hilo excepcional (MUY raro; sólo si es una conexión sorprendente y coherente)
- Propón UNA sola palabra nueva (una palabra), con tildes correctas si procede.
  Debe abrir un camino no obvio, con intención y sentido, y evitar repetir palabras ya usadas.

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
  const payload = {
    palabraMaquina,
    palabraUsuario,
    historial,
  };

  const nueva_palabra = limpiaPalabraIA(propuesta);
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

  // Node SDK suele dar esto listo:
  const raw = (response.output_text || "").trim();

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("JSON IA inválido. Texto recibido:", raw);
    json = {
      hay_hilo: false,
      fuerza_hilo: 1,
      explicacion:
        "No puedo leer el hilo ahora mismo. Respira y prueba otra palabra.",
      nueva_palabra: "bruma",
    };
  }

  const hay_hilo = !!json.hay_hilo;
  let fuerza_hilo = Number(json.fuerza_hilo);
  if (!Number.isFinite(fuerza_hilo)) fuerza_hilo = hay_hilo ? 5 : 1;
  fuerza_hilo = Math.max(0, Math.min(10, Math.round(fuerza_hilo)));

  let explicacion =
    typeof json.explicacion === "string" ? json.explicacion.trim() : "";
  if (!explicacion) {
    explicacion = hay_hilo
      ? "Hay un hilo, aunque sea fino."
      : "Aquí no encuentro un puente real entre las dos palabras.";
  }

  let propuesta =
    typeof json.nueva_palabra === "string" ? json.nueva_palabra.trim() : "";
  if (!propuesta) propuesta = "bruma";

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

app.post("/jugar", async (req, res) => {
  try {
    const { palabraMaquina, palabraUsuario, historial = [] } = req.body || {};

    const pm = normaliza(palabraMaquina);
    const pu = normaliza(palabraUsuario);

    if (!pm || !pu) {
      return res.status(400).json({
        puntuacion: 0,
        explicacion: "Necesito dos palabras para poder escuchar el hilo.",
        nueva_palabra: pm || "bruma",
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
      // IMPORTANTe: por ahora NO mandamos créditos (si quieres, lo quitamos del front)
      // creditosRestantes: 999,
    });
  } catch (err) {
    console.error("Error en /jugar:", err);
    res.status(500).json({
      puntuacion: 0,
      explicacion:
        "Ahora mismo hay ruido en la conexión. Vuelve a intentarlo en unos segundos.",
      nueva_palabra: "bruma",
      hay_hilo: false,
    });
  }
});
function limpiaPalabraIA(str = "") {
  // 1) Normaliza a minúsculas y una sola palabra
  let w = (str || "").toString().trim().toLowerCase().split(/\s+/)[0] || "";

  // 2) Quita diacríticos “raros” (ö -> o, ä -> a, etc.)
  w = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 3) Permite solo letras españolas básicas (a-z y ñ)
  // (si quieres permitir también áéíóúü, lo hacemos después con un paso extra)
  w = w.replace(/[^a-zñ]/g, "");

  return w || "bruma";
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`));
