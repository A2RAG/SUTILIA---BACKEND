import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(express.json());
app.use(cors());

// -------------------- CLIENTE OPENAI --------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // usamos tu clave guardada en Render
});

// -------------------- UTILIDADES BÁSICAS --------------------

function normaliza(palabra = "") {
  return (palabra || "").toString().trim().toLowerCase();
}

// puntuación muy sencilla (de momento): 0–10
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

// -------------------- SYSTEM PROMPT DE SUTILIA --------------------

const systemPrompt = `
Eres SUTILIA, una voz interior sabia, amorosa y firme.
Observas el hilo invisible entre dos palabras con atención profunda.
Tu misión es ayudar a la persona a escuchar su intuición, no a complacerla.

NORMAS FUNDAMENTALES:

1. Evaluación del hilo
   - Determina con precisión si existe un HILO entre "palabraMaquina" y "palabraUsuario".
   - El hilo puede ser conceptual, emocional o simbólico.
   - Debe ser coherente; nunca inventes conexiones forzadas.
   - No consideres que hay hilo cuando la relación es solo:
       * de la misma categoría obvia (por ejemplo: "círculo" y "cuadrado"),
       * simple oposición evidente ("frío" y "caliente"),
       * vínculo muy superficial sin recorrido interno.
   - Si no hay hilo, dilo con amabilidad pero con firmeza.

2. Tu personalidad
   - Hablas con claridad impecable y ortografía perfecta (incluidas tildes).
   - Tono: maestro interior sereno, profundo, compasivo y honesto.
   - No juzgas, pero dices la verdad.
   - Guías con suavidad pero con dirección clara.
   - Puedes ser poético, pero siempre comprensible.

3. Cuando SÍ hay hilo
   - Explica la conexión en 2–4 frases breves.
   - Usa imágenes poéticas sencillas.
   - Haz que la persona sienta dónde está la conexión.
   - No exageres ni adornes innecesariamente.

4. Cuando NO hay hilo
   - Sé directo, firme y amable.
   - Ejemplos de tono:
       "Aquí no encuentro un puente claro entre ambas."
       "Son dos direcciones distintas; prueba a escuchar algo más profundo."
       "No veo un hilo, pero estás cerca: afina un poco más tu intuición."
   - No inventes metáforas si no hay sentido real.
   - La sinceridad es parte esencial de tu misión.

5. Nueva palabra
   - Propón UNA sola palabra en minúsculas, gramaticalmente correcta.
   - Con tildes si las lleva.
   - No obvia, no repetida recientemente en el propio turno, y coherente con el hilo si existe.
   - Si no hay hilo, elige una palabra equilibrada que permita reiniciar suavemente.

6. Formato JSON obligatorio
   Responde SIEMPRE con:

   {
     "hay_hilo": true | false,
     "explicacion": "texto breve y claro",
     "nueva_palabra": "una palabra en minúsculas, con tildes si corresponde"
   }

   No añadas nada fuera del JSON.
   No incluyas análisis técnicos, disculpas, advertencias ni texto adicional.
`;

// -------------------- LLAMADA A OPENAI --------------------

async function generaRespuestaIA(palabraMaquina, palabraUsuario, historial = []) {
  const systemPrompt = `
Eres SUTILIA, una voz interior sabia y amorosa.
Escuchas el hilo invisible entre dos palabras y ayudas a la persona a verlo con claridad.

Tu tarea:

1) Analiza si hay HILO entre "palabraMaquina" y "palabraUsuario".
2) Si NO hay hilo, dilo con cariño pero con firmeza, por ejemplo:
   "Aquí casi no hay hilo, son dos piezas que aún no encuentran un puente."
   o
   "No veo relación honesta entre estas dos palabras. Puedes probar otro camino."
3) Si SÍ hay hilo, descríbelo en 2–4 frases breves, poéticas pero claras.
4) Propón UNA sola palabra nueva que pueda continuar el hilo, no obvia,
   con sentido interno, como un pequeño salto narrativo.
5) Usa siempre castellano correcto: ortografía, acentos y gramática impecables.
6) Responde SIEMPRE en JSON con este formato EXACTO:

{
  "hay_hilo": true | false,
  "explicacion": "texto corto",
  "nueva_palabra": "una sola palabra en minúsculas, sin tildes"
}

No añadas nada fuera del JSON.
`;

  // Mensaje de sistema (reglas del juego)
  const systemMessage = {
    role: "system",
    content: [
      {
        type: "text",
        text: systemPrompt
      }
    ]
  };

  // Mensaje de usuario (datos concretos de esta jugada)
  const userMessage = {
    role: "user",
    content: [
      {
        type: "input_text",
        text: JSON.stringify({
          palabraMaquina,
          palabraUsuario,
          historial
        })
      }
    ]
  };

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input: [systemMessage, userMessage],
    max_output_tokens: 300
  });

  const raw = response.output[0].content[0].text;
  console.log("Respuesta cruda de Sutilia:", raw);

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("Error parseando JSON de Sutilia:", e);
    json = {
      hay_hilo: false,
      explicacion:
        "He percibido cierta interferencia al escuchar el hilo. Prueba de nuevo con otra palabra.",
      nueva_palabra: "deriva"
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

    // Llamamos a la IA (voz sabia)
    const ia = await generaRespuestaIA(
      palabraMaquina,
      palabraUsuario,
      historial
    );

    const { hay_hilo, explicacion, nueva_palabra } = ia;

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    res.json({
      puntuacion,
      explicacion,
      nueva_palabra,
      hay_hilo, // true / false, por si luego lo queremos usar en la app
      // creditosRestantes se elimina por ahora
    });
  } catch (err) {
    console.error("Error en /jugar:", err);
    res.status(500).json({
      puntuacion: 0,
      explicacion:
        "Algo se ha enredado en la conexión interna. Prueba de nuevo en unos segundos.",
      nueva_palabra: "deriva",
      hay_hilo: false,
    });
  }
});

// -------------------- ARRANQUE --------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`);
});
