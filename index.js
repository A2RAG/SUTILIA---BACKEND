import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(express.json());
app.use(cors());

// -------------------- CLIENTE OPENAI --------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // variable que ya tienes en Render
});

// -------------------- TEXTO GUÍA PARA LA IA --------------------

const systemPrompt = `
Eres SUTILIA, una voz interior sabia y amorosa.

Tu forma de responder:
- Hablas con calma, sin juicio, con claridad y profundidad.
- No inventas conexiones donde no las hay.
- Si el hilo entre dos palabras es pobre o inexistente, lo dices con cariño y firmeza.
- Cuando hay hilo, lo describes de manera poética pero comprensible.

Tu tarea en cada turno:

1) Recibirás un objeto JSON con:
   {
     "palabraMaquina": "texto",
     "palabraUsuario": "texto",
     "historial": [ ... ]  // puedes ignorarlo por ahora
   }

2) Debes decidir si hay HILO entre "palabraMaquina" y "palabraUsuario":
   - "hay_hilo": true si existe una relación interna, coherente.
   - "hay_hilo": false si la conexión es forzada, arbitraria o muy pobre.

3) Si NO hay hilo:
   - Sé claro y honesto: explica por qué no hay un puente claro entre las dos palabras.
   - Invita al jugador a buscar un vínculo más auténtico.

4) Si SÍ hay hilo:
   - Explica en 2–4 frases cortas la relación entre las dos palabras.
   - Usa un lenguaje cercano, con sensibilidad, pero sin ser empalagoso.
   - Puedes ser algo poético, pero siempre claro.

5) Propón UNA sola palabra nueva que pueda continuar el hilo:
   - Debe tener sentido interno.
   - No debe ser obvia ni demasiado literal.
   - Debe ser una única palabra en minúsculas, con ortografía correcta.
   - No inventes palabras.

6) Responde SIEMPRE en JSON con este formato EXACTO:

{
  "hay_hilo": true | false,
  "explicacion": "texto corto",
  "nueva_palabra": "una sola palabra en minusculas, puede llevar tildes y ñ"
}

No añadas comentarios, saludos ni texto extra fuera del JSON.
`;

// -------------------- UTILIDADES BÁSICAS --------------------

function normaliza(palabra = "") {
  return (palabra || "").toString().trim().toLowerCase();
}

// puntuación sencilla 0-10 según diferencia de letras
function puntuaSutileza(palabraMaquina, palabraUsuario) {
  const a = normaliza(palabraMaquina);
  const b = normaliza(palabraUsuario);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const sa = new Set(a.split(""));
  const sb = new Set(b.split(""));

  const inter = [...sa].filter((ch) => sb.has(ch)).length;
  const union = new Set([...sa, ...sb]).size || 1;
  const sim = inter / union; // 1 = muy parecidas, 0 = muy diferentes

  let score = Math.round((1 - sim) * 10);
  if (score < 0) score = 0;
  if (score > 10) score = 10;
  return score;
}

// -------------------- LLAMADA A OPENAI --------------------

async function generaRespuestaIA(palabraMaquina, palabraUsuario, historial = []) {
  const userPayload = {
    palabraMaquina,
    palabraUsuario,
    historial,
  };

  const response = await openai.responses.create({
    model: "gpt-4o-mini", // 👈 CAMBIAMOS AQUÍ EL MODELO
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: systemPrompt,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(userPayload),
          },
        ],
      },
    ],
    max_output_tokens: 300,
  });

  // El modelo devuelve output_text
  const raw = response.output[0].content[0].text || "";

  // Limpiamos posible envoltura ```json ... ```
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
        "He percibido interferencia al escuchar el hilo. Prueba de nuevo con otra palabra.",
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

  // Nos quedamos con la primera palabra por si se enrolla
  if (nueva_palabra.includes(" ")) {
    nueva_palabra = nueva_palabra.split(/\s+/)[0];
  }

  // Permitimos letras con tildes y ñ
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

    nueva_palabra = normaliza(nueva_palabra);

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    res.json({
      puntuacion,
      explicacion,
      nueva_palabra,
      creditosRestantes: 999, // por ahora fijo
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
