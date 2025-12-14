import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(express.json());
app.use(cors());

// -------------------- CLIENTE OPENAI --------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -------------------- UTILIDADES BÁSICAS --------------------

function normaliza(palabra = "") {
  return (palabra || "").toString().trim().toLowerCase();
}

// puntuación muy sencilla (de momento)
function puntuaSutileza(palabraMaquina, palabraUsuario) {
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
  return score;
}

// -------------------- PROMPT DEL "ALMA" DE SUTILIA --------------------

const systemPrompt = `
Eres SUTILIA, una voz interior sabia, amorosa y muy clara.
No juzgas, no gritas, pero eres honesta y exigente con el hilo entre dos palabras.

Reglas importantes:
- Respondes SIEMPRE en castellano, con buena ortografía y tildes.
- Si no hay hilo, lo dices con cariño pero con firmeza: no inventas conexiones
  solo para quedar bien.
- Si hay hilo, lo explicas de forma poética pero comprensible y concreta.
- No haces terapia, solo observas el vínculo entre palabras.

Tu tarea:

1) Analiza si hay HILO entre "palabraMaquina" y "palabraUsuario".
   El hilo es una relación interna con sentido, aunque sea sutil.
   Si la conexión es forzada o casi inexistente, considera que NO hay hilo.

2) "hay_hilo" debe ser:
   - true: solo si la relación tiene sentido interno claro.
   - false: si la relación es muy forzada, literal o casi inexistente.

3) "explicacion":
   - 1 a 4 frases breves.
   - Claras, amables, sin tecnicismos.
   - Si no hay hilo, invita a buscar otra palabra sin culpabilizar al jugador.

4) "nueva_palabra":
   - Una sola palabra en minúsculas, con tildes correctas si las necesita.
   - Con sentido para continuar el hilo, pero no demasiado obvia.
   - Nunca repitas siempre la misma palabra si puedes evitarlo.

Formato de respuesta:
Devuelves SIEMPRE un JSON válido, sin texto adicional, con esta forma exacta:

{
  "hay_hilo": true | false,
  "explicacion": "texto corto",
  "nueva_palabra": "una sola palabra en minúsculas"
}
`;

// -------------------- LLAMADA A OPENAI --------------------

async function generaRespuestaIA(palabraMaquina, palabraUsuario, historial = []) {
  const userPayload = {
    palabraMaquina,
    palabraUsuario,
    historial,
  };

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text", // 👈 IMPORTANTE: NO "text"
            text: systemPrompt,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text", // 👈 IMPORTANTE: NO "text"
            text: JSON.stringify(userPayload),
          },
        ],
      },
    ],
    max_output_tokens: 300,
  });

  // Sacamos el texto de salida
  let raw = "";
  const firstOutput = response.output?.[0];

  if (firstOutput && Array.isArray(firstOutput.content)) {
    for (const chunk of firstOutput.content) {
      if (chunk.type === "output_text" && typeof chunk.text === "string") {
        raw += chunk.text;
      }
    }
  }

  if (!raw) {
    raw = "";
  }

  // Limpiamos posibles ```json ... ```
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
    console.error("Error al parsear JSON de la IA. Texto recibido:", raw);
    json = {
      hay_hilo: false,
      explicacion:
        "He percibido cierta interferencia al escuchar el hilo. Prueba de nuevo con otra palabra.",
      nueva_palabra: "deriva",
    };
  }

  // Aseguramos tipos y campos
  const hay_hilo = !!json.hay_hilo;

  let explicacion =
    typeof json.explicacion === "string" ? json.explicacion.trim() : "";

  let nueva_palabra =
    typeof json.nueva_palabra === "string"
      ? json.nueva_palabra.toLowerCase().trim()
      : "bruma";

  // Nos quedamos SOLO con la primera palabra (por si la IA se enrolla)
  if (nueva_palabra.includes(" ")) {
    nueva_palabra = nueva_palabra.split(/\s+/)[0];
  }

  // Permitimos letras con tildes y ñ; si mete cosas raras, caemos a "bruma"
  if (!/^[a-záéíóúüñ]+$/.test(nueva_palabra)) {
    nueva_palabra = "bruma";
  }

  if (!explicacion) {
    explicacion = hay_hilo
      ? "Hay un hilo entre ambas palabras, aunque sea fino."
      : "Aquí no encuentro un puente claro entre las dos palabras.";
  }

  return { hay_hilo, explicacion, nueva_palabra };
}

// -------------------- ENDPOINTS --------------------

app.get("/ping", (req, res) => {
  res.send("pong");
});

app.post("/jugar", async (req, res) => {
  try {
    const { palabraMaquina, palabraUsuario, historial = [] } = req.body || {};

    const puntuacion = puntuaSutileza(palabraMaquina, palabraUsuario);

    const ia = await generaRespuestaIA(
      palabraMaquina,
      palabraUsuario,
      historial
    );

    let explicacion = ia.explicacion || "";
    let nueva_palabra = ia.nueva_palabra || "bruma";

    nueva_palabra = normaliza(nueva_palabra).replace(/[^a-záéíóúüñ]/g, "");

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    res.json({
      puntuacion,
      explicacion,
      nueva_palabra,
      creditosRestantes: 999, // luego ya los quitamos
      hay_hilo: !!ia.hay_hilo,
    });
  } catch (err) {
    console.error("Error en /jugar:", err);
    res.status(500).json({
      puntuacion: 0,
      explicacion:
        "Algo se ha enredado en la conexión interna. Prueba de nuevo en unos segundos.",
      nueva_palabra: "deriva",
      creditosRestantes: 999,
      hay_hilo: false,
    });
  }
});

// -------------------- ARRANQUE --------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`);
});
