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

// Pon en Render (Environment):
// OPENAI_MODEL = (el modelo que tengas disponible)
// Si no pones nada, usa este por defecto:
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// -------------------- UTILIDADES --------------------
function normaliza(p = "") {
  return (p || "").toString().trim();
}

// Para el juego: aceptamos tildes/ñ y espacios SOLO para limpiar extremos.
// (La IA debe devolver una sola palabra. Aquí solo defendemos el backend.)
function limpiaPalabraIA(w) {
  let s = normaliza(w).toLowerCase();

  // si la IA devuelve varias, nos quedamos con la primera
  if (s.includes(" ")) s = s.split(/\s+/)[0];

  // solo letras españolas comunes
  // (permitimos tildes y ñ; si mete símbolos raros, devolvemos null)
  if (!/^[a-záéíóúüñ]+$/i.test(s)) return null;

  return s;
}

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.max(min, Math.min(max, x));
}

// -------------------- PROMPT --------------------
const systemPrompt = `
Eres SUTILIA: una voz interior sabia, amable y firme. No juzgas ni gritas.
Tu misión es proteger la VERDAD del hilo: NO inventas conexiones por complacer.

Recibes:
- palabraMaquina
- palabraUsuario
- historial (lista de turnos anteriores)

Reglas CLAVE:
1) Decide si hay HILO real entre palabraMaquina y palabraUsuario.
   - Si NO hay hilo, dilo claro y con cariño. No fuerces metáforas.
2) Dificultad ALTA:
   - 10/10 es MUY raro. Solo si el salto es cuántico pero coherente.
   - 7–9 solo si el vínculo es sutil pero defendible.
   - 1–4 si es literal/obvio.
3) Si NO hay hilo:
   - "hay_hilo": false
   - "puntuacion": 0
   - "nueva_palabra": DEBE ser exactamente la MISMA que palabraMaquina (para mantener el hilo anterior en modo clásico).
4) Si SÍ hay hilo:
   - "hay_hilo": true
   - "puntuacion": 1–10 (10 rarísimo)
   - "explicacion": 1–3 frases claras + poéticas (sin humo).
   - "nueva_palabra": UNA sola palabra correcta en español, con tildes si lleva, que continúe el hilo sin ser obvia.
5) Responde SIEMPRE SOLO en JSON válido, sin texto fuera, con este formato exacto:

{
  "hay_hilo": true | false,
  "puntuacion": 0-10,
  "explicacion": "texto",
  "nueva_palabra": "palabra"
}
`;

// -------------------- IA --------------------
async function generaRespuestaIA(palabraMaquina, palabraUsuario, historial = []) {
  const payload = {
    palabraMaquina: normaliza(palabraMaquina),
    palabraUsuario: normaliza(palabraUsuario),
    historial,
  };

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(payload) },
    ],
    max_output_tokens: 280,
  });

  const raw = response?.output?.[0]?.content?.[0]?.text || "";

  // por si viniera envuelto en ```json
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
    console.error("IA devolvió JSON inválido:", raw);
    return {
      hay_hilo: false,
      puntuacion: 0,
      explicacion:
        "Ahora mismo no puedo escuchar el hilo con nitidez. Inténtalo de nuevo.",
      nueva_palabra: normaliza(palabraMaquina),
    };
  }

  // Normalización y defensas
  const hay_hilo = !!json.hay_hilo;

  let puntuacion = clampInt(Number(json.puntuacion), 0, 10);
  let explicacion =
    typeof json.explicacion === "string" ? json.explicacion.trim() : "";

  let nueva_palabra_raw =
    typeof json.nueva_palabra === "string" ? json.nueva_palabra : "";

  // Si NO hay hilo -> puntuación 0 y nueva_palabra = palabraMaquina (NO cambia)
  if (!hay_hilo) {
    puntuacion = 0;
    return {
      hay_hilo: false,
      puntuacion,
      explicacion:
        explicacion ||
        "Aquí no encuentro un puente claro entre las dos palabras.",
      nueva_palabra: normaliza(palabraMaquina),
    };
  }

  // Si SÍ hay hilo -> limpiamos nueva palabra IA
  const nueva_palabra = limpiaPalabraIA(nueva_palabra_raw) || null;

  return {
    hay_hilo: true,
    puntuacion,
    explicacion:
      explicacion ||
      "Hay un hilo entre ambas palabras, fino pero real. Podemos seguirlo.",
    nueva_palabra: nueva_palabra || normaliza(palabraMaquina), // fallback conservador
  };
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
        hay_hilo: false,
        puntuacion: 0,
        explicacion: "Necesito dos palabras para poder escuchar el hilo.",
        nueva_palabra: pm || "amistad",
      });
    }

    const ia = await generaRespuestaIA(pm, pu, historial);

    // Norma del juego:
    // - Si hay_hilo=false -> nueva_palabra == palabraMaquina (mantener hilo)
    // - Si hay_hilo=true  -> puede avanzar a nueva palabra
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    return res.json({
      hay_hilo: ia.hay_hilo,
      puntuacion: ia.puntuacion,
      explicacion: ia.explicacion,
      nueva_palabra: ia.nueva_palabra,
      // Quitamos créditos “reales” aquí. Si la app lo necesita aún, lo dejamos vacío.
      creditosRestantes: null,
    });
  } catch (err) {
    console.error("Error en /jugar:", err);
    return res.status(500).json({
      hay_hilo: false,
      puntuacion: 0,
      explicacion:
        "Algo se ha enredado en la conexión interna. Prueba de nuevo en unos segundos.",
      nueva_palabra: "deriva",
      creditosRestantes: null,
    });
  }
});

// -------------------- ARRANQUE --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`);
  console.log(`Modelo OpenAI: ${OPENAI_MODEL}`);
});
