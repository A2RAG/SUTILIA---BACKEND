import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(express.json());
app.use(cors());

// -------------------- CLIENTE OPENAI --------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // 👈 usamos la variable que ya guardaste en Render
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

// -------------------- LLAMADA A OPENAI --------------------

async function generaRespuestaIA(palabraMaquina, palabraUsuario, historial = []) {
  const systemPrompt = `
Eres SUTILIA, un observador poético que escucha el hilo invisible entre dos palabras.
Tu tarea:

1) Analiza si hay HILO entre "palabraMaquina" y "palabraUsuario".
2) Si NO hay hilo, dilo claramente con cariño: por ejemplo,
   "Aquí casi no hay hilo, son dos piezas que aún no encuentran un puente."
3) Si SÍ hay hilo, descríbelo en 2–4 frases breves, poéticas pero claras.
4) Propón UNA sola palabra nueva que pueda continuar el hilo, no obvia,
   con sentido interno, como un pequeño salto narrativo.
5) Responde SIEMPRE en JSON con este formato EXACTO:

{
  "hay_hilo": true | false,
  "explicacion": "texto corto",
  "nueva_palabra": "una sola palabra en minúsculas, sin tildes"
}

No añadas nada fuera del JSON.
`;

  const userContent = {
    role: "user",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          palabraMaquina,
          palabraUsuario,
          historial,
        }),
      },
    ],
  };

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input: [systemPrompt, userContent],
    max_output_tokens: 300,
  });

  const raw = response.output[0].content[0].text;
  let json;

  try {
    json = JSON.parse(raw);
  } catch (e) {
    // Si algo va mal, devolvemos algo neutro
    json = {
      hay_hilo: false,
      explicacion:
        "He percibido cierta interferencia al escuchar el hilo. Prueba de nuevo con otra palabra.",
      nueva_palabra: "deriva",
    };
  }

  return json;
}

// -------------------- ENDPOINTS --------------------

app.get("/ping", (req, res) => {
  res.send("pong");
});

app.post("/jugar", async (req, res) => {
  try {
    const { palabraMaquina, palabraUsuario, historial = [] } = req.body || {};

    const puntuacion = puntuaSutileza(palabraMaquina, palabraUsuario);

    // Llamamos a la IA
    const ia = await generaRespuestaIA(
      palabraMaquina,
      palabraUsuario,
      historial
    );

    let explicacion = ia.explicacion || "";
    let nueva_palabra = ia.nueva_palabra || "bruma";

    // normalizamos por si acaso
    nueva_palabra = normaliza(nueva_palabra).replace(/[^a-zñ]/g, "");

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    res.json({
      puntuacion,
      explicacion,
      nueva_palabra,
      // por ahora un número fijo, más adelante lo haremos real
      creditosRestantes: 999,
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
