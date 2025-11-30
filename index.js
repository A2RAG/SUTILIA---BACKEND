import express from 'express';
import cors from 'cors';

const app = express();

app.use(express.json());
app.use(cors());

// --- Utilidades de texto ---

function normaliza(palabra = '') {
  return (palabra || '').toString().trim().toLowerCase();
}

// calculamos parecido de letras (muy simple)
function similitudLetras(a, b) {
  const sa = new Set(a.split(''));
  const sb = new Set(b.split(''));
  const inter = [...sa].filter(ch => sb.has(ch)).length;
  const union = new Set([...sa, ...sb]).size || 1;
  return inter / union; // 0 = nada en común, 1 = iguales
}

// puntuación 0–10: cuanto más diferentes, más sutil
function puntuaSutileza(palabraMaquina, palabraUsuario) {
  const a = normaliza(palabraMaquina);
  const b = normaliza(palabraUsuario);

  if (!a || !b) return 0;

  if (a === b) return 1; // misma palabra, nada sutil

  const sim = similitudLetras(a, b);

  let score = Math.round((1 - sim) * 10);

  if (score < 0) score = 0;
  if (score > 10) score = 10;

  return score;
}

function creaExplicacion(palabraMaquina, palabraUsuario, puntuacion) {
  const a = normaliza(palabraMaquina);
  const b = normaliza(palabraUsuario);

  if (!a || !b) {
    return 'Necesito dos palabras para poder escuchar la sutileza entre ellas.';
  }

  if (a === b) {
    return `Has elegido exactamente la misma palabra: "${palabraUsuario}". Es una conexión directa, sin sutileza.`;
  }

  if (puntuacion >= 8) {
    return `Entre "${palabraMaquina}" y "${palabraUsuario}" casi no hay vínculo evidente. La relación es delicada, inesperada, muy sutil.`;
  } else if (puntuacion >= 5) {
    return `La conexión entre "${palabraMaquina}" y "${palabraUsuario}" no es obvia, pero todavía se intuyen ecos en común. Una sutileza a medio camino.`;
  } else {
    return `Hay bastante cercanía entre "${palabraMaquina}" y "${palabraUsuario}". La unión es más evidente que sutil.`;
  }
}

// ------------- Endpoints -------------

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.post('/jugar', (req, res) => {
  const { palabraMaquina, palabraUsuario } = req.body || {};

  const puntuacion = puntuaSutileza(palabraMaquina, palabraUsuario);
  const explicacion = creaExplicacion(palabraMaquina, palabraUsuario, puntuacion);

  // nueva palabra: usamos la del usuario (normalizada). Si no hay, mantenemos la máquina.
  const nueva_palabra = normaliza(palabraUsuario) || normaliza(palabraMaquina) || 'bruma';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  res.json({
    puntuacion,
    explicacion,
    nueva_palabra,
    creditosRestantes: 42
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`);
});
