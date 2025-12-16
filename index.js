import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json());
app.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------------------- UTILIDADES --------------------

function normaliza(palabra = "") {
  return (palabra || "").toString().trim().toLowerCase();
}

// puntuación temporal (la afinaremos luego). Por ahora: si NO hay hilo => muy baja.
function puntuaSutilezaConHilo(hayHilo, palabraMaquina, palabraUsuario) {
  if (!hayHilo) return 0;

  const a = normaliza(palabraMaquina);
  const b = normaliza(palabraUsuario);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const sa = new Set(a.split(""));
  const sb = new Set(b.split(""));
  const inter = [...sa].filter((ch) => sb.has(ch)).length;
  const union = new Set([...sa, ...sb]).size || 1;
  const sim = inter / union;

  let score = Math.round((1 - sim) * 10);
  if (score < 0) score = 0;
  if (score > 10) score = 10;

  // Endurecemos un poco: si es muy literal, que no suba tanto
  if (score > 7) score = 7;

  return score;
}

// -------------------- PROMPT (VOZ SABIA + FIRME) --------------------

const systemPrompt = `
Eres SUTILIA: una voz interior sabia, amorosa y firme.
No juzgas ni gritas. No eres complaciente. No inventas conexiones para “quedar bien”.
Tu trabajo es VER si existe un hilo real entre dos palabras, y acompañar al jugador a encontrarlo.

Reglas:
- Si NO hay hilo, di claramente que NO hay hilo. Sin adornos innecesarios.
- Si SÍ hay hilo, descríbelo con claridad (poético, sí, pero entendible).
- La palabra nueva debe ser UNA sola palabra en español, correctamente escrita (con tildes si toca).
- Esa palabra nueva debe ser coherente con el hilo y no ser obvia.
- Responde SOLO en JSON válido, sin texto fuera.

Formato exacto:
{
  "hay_hilo": true | false,
  "explicacion": "2 a 4 frases, claras, sin relleno",
  "nueva_palabra": "una sola palabra"
}

Criterio de hilo:
- Debe existir un puente narrativo razonable (A→B con un pequeño recorrido), NO saltos aleatorios.
- Si parecen elegidas al azar, hay_hilo = false.
`;

// -------------------- IA --------------------

async function generaRespuestaIA(palabraMaquina, palabraUsuario, historial = []) {
  const userPayload = { palabraMaquina, palabraUsuario, historial };

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    max_output_tokens: 260,
  });

  const raw = response.output?.[0]?.content?.[0]?.text || "";

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
    console.error("IA devolvió algo no-JSON. Texto recibido:", raw);
    return {
      hay_hilo: false,
      explicacion:
        "Ahora mismo no puedo escuchar con nitidez. Prueba otra palabra: busca un puente real, no un salto al azar.",
      nueva_palabra: palabraMaquina || "bruma",
    };
  }

  const hay_hilo = !!json.hay_hilo;
  const explicacion =
    typeof json.explicacion === "string" && json.explicacion.trim()
      ? json.explicacion.trim()
      : hay_hilo
      ? "Sí hay hilo, pero es muy fino. Acércate: nómbralo con precisión."
      : "Aquí no encuentro un puente real entre las dos palabras. Intenta otra, más honesta con lo que sientes.";

  let nueva_palabra =
    typeof json.nueva_palabra === "string" && json.nueva_palabra.trim()
      ? json.nueva_palabra.trim()
      : palabraMaquina || "bruma";

  // Solo la primera palabra si mete más de una
  if (/\s/.test(nueva_palabra)) nueva_palabra = nueva_palabra.split(/\s+/)[0];

  // Permitimos letras españolas con tildes y ñ
  if (!/^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+$/.test(nueva_palabra)) {
    nueva_palabra = palabraMaquina || "bruma";
  }

  // Normalizamos solo espacios alrededor; NO quitamos tildes
  return { hay_hilo, explicacion, nueva_palabra };
}

// -------------------- ENDPOINTS --------------------

app.get("/ping", (req, res) => res.send("pong"));

app.post("/jugar", async (req, res) => {
  try {
    const { palabraMaquina, palabraUsuario, historial = [] } = req.body || {};

    const ia = await generaRespuestaIA(palabraMaquina, palabraUsuario, historial);

    // Si NO hay hilo, NO avanzamos palabra: se mantiene la misma
    const palabraSiguiente = ia.hay_hilo ? ia.nueva_palabra : palabraMaquina;

    const puntuacion = puntuaSutilezaConHilo(
      ia.hay_hilo,
      palabraMaquina,
      palabraUsuario
    );

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({
      hay_hilo: ia.hay_hilo,
      explicacion: ia.explicacion,
      nueva_palabra: palabraSiguiente,
      puntuacion,
    });
  } catch (err) {
    console.error("Error en /jugar:", err);
    res.status(500).json({
      hay_hilo: false,
      explicacion:
        "Se ha cortado el hilo de conexión. Respira y prueba de nuevo en unos segundos.",
      nueva_palabra: req.body?.palabraMaquina || "bruma",
      puntuacion: 0,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`));
