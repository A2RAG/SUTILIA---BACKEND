import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json());
app.use(cors());

// -------------------- CONFIG --------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ponlo en Render como variable: OPENAI_MODEL
// Ej: "gpt-4o-mini" o el que veas en /v1/models
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Semillas para palabra inicial / continuaciones cuando haya fallback
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
  "umbral",
  "eco",
  "pulsación",
  "renacer",
  "visión",
  "silencio",
  "lazo",
  "complicidad",
  "memoria",
  "metamorfosis",
];

// -------------------- UTILIDADES --------------------
function normaliza(palabra = "") {
  return (palabra || "").toString().trim();
}

function eligeSemilla(excluir) {
  const pool = PALABRAS_SEMILLA.filter((w) => w !== excluir);
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] || "bruma";
}

// Puntuación “técnica” simple (por si la IA falla, no para decidir el 10)
function puntuaSutilezaBasica(palabraMaquina, palabraUsuario) {
  const a = normaliza(palabraMaquina).toLowerCase();
  const b = normaliza(palabraUsuario).toLowerCase();

  if (!a || !b) return 0;
  if (a === b) return 1;

  const sa = new Set(a.split(""));
  const sb = new Set(b.split(""));
  const inter = [...sa].filter((ch) => sb.has(ch)).length;
  const union = new Set([...sa, ...sb]).size || 1;
  const sim = inter / union;

  let score = Math.round((1 - sim) * 10);
  score = Math.max(0, Math.min(10, score));
  return score;
}

// -------------------- PROMPT (VOZ + EXIGENCIA) --------------------
const systemPrompt = `
Eres SUTILIA: una voz interior sabia, amable y firme.
No juzgas ni gritas. Acompañas con claridad, sin salvar.
Tu prioridad es la VERACIDAD: si no hay hilo real, lo dices.
No inventes conexiones por quedar bien.

Tarea:
- Recibes "palabraMaquina", "palabraUsuario" e "historial".
- Decide si hay hilo real (hay_hilo).
- Da una explicación breve y clara (1 a 3 frases). Puede ser poética, pero entendible.
- Evalúa la fuerza del hilo con un número "hilo_score" de 0 a 10:
    0-2: no hay puente (azar / choque / inconexo)
    3-4: puente muy débil (forzado)
    5-6: hilo aceptable pero común
    7-8: hilo fino, interesante, con sentido interno
    9: hilo muy sutil y coherente
    10: EXCEPCIONAL (rarísimo). Solo si hay una conexión profunda, elegante e inesperada, sin trampas.
  IMPORTANTE: si NO hay hilo real, hilo_score DEBE ser 0, 1 o 2 (no regales 8 o 9).
- Propón "nueva_palabra" (una sola palabra) SOLO si hay_hilo es true.
  Si hay_hilo es false, "nueva_palabra" debe ser la misma que "palabraMaquina" (para que el jugador siga intentando).
- "nueva_palabra" debe ir en minúsculas y puede llevar tildes y ñ (español correcto).

Responde SIEMPRE en JSON puro, sin texto extra, con este formato EXACTO:

{
  "hay_hilo": true,
  "hilo_score": 0,
  "explicacion": "…",
  "nueva_palabra": "…"
}
`;

// -------------------- IA --------------------
async function generaRespuestaIA(palabraMaquina, palabraUsuario, historial = []) {
  const payload = {
    palabraMaquina,
    palabraUsuario,
    historial,
  };

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
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
    max_output_tokens: 260,
  });

  const raw = response.output_text || "";
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let json;
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON IA inválido. Raw:", raw);
    return {
      hay_hilo: false,
      hilo_score: 0,
      explicacion:
        "Ahora mismo no puedo escuchar el hilo con claridad. Prueba de nuevo en unos segundos.",
      nueva_palabra: palabraMaquina,
    };
  }

  // Normalización y garantías
  const hay_hilo = !!json.hay_hilo;

  let hilo_score = Number.isFinite(json.hilo_score) ? Number(json.hilo_score) : 0;
  hilo_score = Math.max(0, Math.min(10, Math.round(hilo_score)));

  let explicacion =
    typeof json.explicacion === "string" ? json.explicacion.trim() : "";

  let nueva_palabra =
    typeof json.nueva_palabra === "string" ? json.nueva_palabra.trim() : "";

  // Reglas duras anti-complacencia:
  if (!hay_hilo) {
    // Si dice que no hay hilo, score no puede ser alto
    if (hilo_score > 2) hilo_score = 2;
    // y no cambiamos la palabra (para que el reto sea real)
    nueva_palabra = palabraMaquina;
    if (!explicacion) {
      explicacion =
        "Aquí no encuentro un puente claro entre estas dos palabras. Respira y prueba otra conexión más honesta.";
    }
  } else {
    // Si hay hilo pero score es absurdo, lo bajamos a un mínimo razonable
    if (hilo_score < 3) hilo_score = 3;

    // nueva_palabra: una sola palabra, minúsculas
    nueva_palabra = nueva_palabra.toLowerCase();
    if (nueva_palabra.includes(" ")) nueva_palabra = nueva_palabra.split(/\s+/)[0];

    // si mete algo raro, ponemos semilla
    if (!/^[a-záéíóúüñ]+$/i.test(nueva_palabra)) {
      nueva_palabra = eligeSemilla(palabraMaquina);
    }
    if (!explicacion) {
      explicacion = "Hay un hilo, aunque sea fino. Puedes seguirlo sin forzarlo.";
    }
  }

  return { hay_hilo, hilo_score, explicacion, nueva_palabra };
}

// -------------------- ENDPOINTS --------------------

// Ping
app.get("/ping", (req, res) => res.send("pong"));

// Para que la primera palabra sea aleatoria (y no siempre “amistad”)
app.get("/seed", (req, res) => {
  res.json({ palabra: eligeSemilla() });
});

// Jugar
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

    // IA decide (estricto)
    const ia = await generaRespuestaIA(pm, pu, historial);

    // Puntuación final: IA manda.
    // (Si algún día quieres mezcla, se puede, pero ahora buscamos “reto real”.)
    let puntuacion = ia.hilo_score;

    // Por seguridad, si IA falla y devuelve todo vacío:
    if (!Number.isFinite(puntuacion)) {
      puntuacion = puntuaSutilezaBasica(pm, pu);
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({
      puntuacion,
      explicacion: ia.explicacion,
      nueva_palabra: ia.nueva_palabra,
      hay_hilo: ia.hay_hilo,
    });
  } catch (err) {
    console.error("Error en /jugar:", err);

    // Si el error es de modelo, lo dejamos MUY visible en logs
    // y devolvemos fallback sin romper juego.
    res.status(200).json({
      puntuacion: 0,
      explicacion:
        "Ahora mismo no puedo escuchar el hilo con claridad. Prueba de nuevo en unos segundos.",
      nueva_palabra: "deriva",
      hay_hilo: false,
    });
  }
});

// -------------------- ARRANQUE --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`);
  console.log(`Modelo OpenAI: ${OPENAI_MODEL}`);
});
