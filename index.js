console.log('Sutilia backend v2 – lógica de sutileza simple');

import express from 'express';
import cors from 'cors';

// 👇 importamos el "cerebro" de Sutilia
import { analizarTurno } from './sutilia_brain.js';

const app = express();

app.use(express.json());
app.use(cors());

// ------------- Endpoints -------------

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.post('/jugar', (req, res) => {
  const { palabraMaquina, palabraUsuario, historial } = req.body || {};

  // Delegamos toda la lógica al cerebro
  const resultado = analizarTurno({
    palabraMaquina,
    palabraUsuario,
    historial: historial || []
  });

  const { puntuacion, explicacion, nueva_palabra, rareza } = resultado;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  res.json({
    puntuacion,
    explicacion,
    nueva_palabra,
    rareza,
    creditosRestantes: 42 // de momento lo dejamos fijo
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`);
});
