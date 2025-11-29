import express from 'express';
import cors from 'cors';

const app = express();

// Para que el servidor pueda entender JSON
app.use(express.json());

// Para permitir peticiones desde fuera (como tu app de Android)
app.use(cors());

// Endpoint simple para probar que el servidor funciona
app.get('/ping', (req, res) => {
    res.send('pong');
});

// Endpoint de juego /jugar (de momento SIN IA, solo de prueba)
app.post('/jugar', (req, res) => {
    const { palabraMaquina, palabraUsuario } = req.body || {};

    // Forzamos explícitamente UTF-8 en la respuesta
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    res.json({
        puntuacion: 8,
        explicacion:
            `Probando acentos: corazón, canción, ilusión, niño, acción, brújula.\n` +
            `También he recibido la palabra de la máquina "${palabraMaquina}" ` +
            `y tu palabra "${palabraUsuario}".`,
        nueva_palabra: 'brújula',
        creditosRestantes: 42
    });
});

// Usamos el puerto que nos diga el entorno o 3000 por defecto
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`);
});