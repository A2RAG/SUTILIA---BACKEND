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

    // Respuesta fija de prueba
    res.json({
        puntuacion: 8,
        explicacion: `Respuesta de prueba. He recibido la palabra de la máquina "${palabraMaquina}" y tu palabra "${palabraUsuario}".`,
        nueva_palabra: "bruma",
        creditosRestantes: 42
    });
});

// Usamos el puerto que nos diga el entorno o 3000 por defecto
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor Sutilia escuchando en el puerto ${PORT}`);
});