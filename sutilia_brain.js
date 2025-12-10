// sutilia_brain.js
// --------------------------------------------
// Primer "cerebro" sencillo de Sutilia.
// Aquí decidimos:
//  - si hay hilo entre las palabras
//  - cuántos puntos damos (0–10)
//  - cómo explicamos la conexión
//  - qué nueva palabra propone la máquina
// --------------------------------------------

// Palabras poéticas que la máquina puede usar
const PALABRAS_SEMILLA = [
  'bruma',
  'orilla',
  'invierno',
  'latido',
  'deriva',
  'umbría',
  'faro',
  'vacío',
  'círculo',
  'marea'
];

// Normaliza texto: quita mayúsculas, espacios y tildes
function limpia(texto = '') {
  return (texto || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos
}

/**
 * Mide un "hilo mínimo" entre dos palabras
 * Empieza siendo muy sencillo: número de letras comunes.
 */
function cuentaLetrasComunes(a, b) {
  const sa = new Set(limpia(a).split(''));
  const sb = new Set(limpia(b).split(''));

  let comunes = 0;
  sb.forEach((ch) => {
    if (sa.has(ch)) comunes++;
  });

  return comunes;
}

/**
 * Elige la siguiente palabra de la máquina.
 * Intentamos NO repetir la palabra de la máquina ni la del usuario.
 */
function elegirNuevaPalabra(palabraMaquina, palabraUsuario) {
  const prohibidas = new Set([
    limpia(palabraMaquina),
    limpia(palabraUsuario)
  ]);

  const candidatas = PALABRAS_SEMILLA.filter(
    (p) => !prohibidas.has(limpia(p))
  );

  const base = candidatas.length > 0 ? candidatas : PALABRAS_SEMILLA;
  const idx = Math.floor(Math.random() * base.length);
  return base[idx];
}

/**
 * Cerebro principal de un turno.
 * Recibe las palabras y el historial (de momento no usamos historial, pero ya está preparado).
 */
export function analizarTurno({ palabraMaquina, palabraUsuario, historial }) {
  const a = limpia(palabraMaquina);
  const b = limpia(palabraUsuario);

  // Controles básicos
  if (!a || !b) {
    return {
      puntuacion: 0,
      explicacion:
        'Necesito dos palabras vivas para poder escuchar el hilo entre ellas.',
      nueva_palabra: palabraMaquina || 'amistad',
      rareza: 'comun'
    };
  }

  // 1) Medimos un "hilo mínimo"
  const comunes = cuentaLetrasComunes(a, b);

  let puntuacion;
  let comentario;

  if (a === b) {
    puntuacion = 1;
    comentario = `Has elegido exactamente "${palabraUsuario}". Es una unión directa, sin sutileza.`;
  } else if (comunes === 0) {
    puntuacion = 2;
    comentario =
      'Aquí casi no hay hilo. Puedes probar con una imagen, recuerdo o sensación que toque a ambas palabras.';
  } else if (comunes === 1) {
    puntuacion = 4;
    comentario =
      'Hay un hilo mínimo, casi invisible. Se intuye algo, pero todavía puedes hilar más fino.';
  } else if (comunes === 2) {
    puntuacion = 7;
    comentario =
      'La conexión comienza a sentirse: no es obvia, pero podría contarse como un pequeño relato.';
  } else {
    puntuacion = 9;
    comentario =
      'El hilo entre ambas palabras vibra con fuerza silenciosa. No es literal, pero tiene sentido interno.';
  }

  // 2) Rareza estética (solo para colorear la interfaz)
  let rareza;
  if (puntuacion >= 8) rareza = 'evocadora';
  else if (puntuacion >= 5) rareza = 'inusual';
  else rareza = 'comun';

  // 3) Nueva palabra de la máquina
  const nueva_palabra = elegirNuevaPalabra(palabraMaquina, palabraUsuario);

  // 4) Explicación final breve
  const explicacion =
    comentario +
    ' (Esta lógica aún es sencilla; poco a poco la haremos más poética y narrativa.)';

  return {
    puntuacion,
    explicacion,
    nueva_palabra,
    rareza
  };
}
