// sutilia_brain.js
// --------------------------------------------
// "Cerebro" de Sutilia (v2):
//  - mide hilo entre palabras
//  - puntúa 0–10
//  - explica la conexión
//  - propone nueva palabra (semillas ampliadas + mezcla + mute + cambio)
// --------------------------------------------

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
 * Devuelve un array único por comparación normalizada (sin tildes / minúsculas).
 * Conserva la primera aparición "bonita" (con acento si la traía).
 */
function uniqueByNormalized(arr = []) {
  const seen = new Set();
  const out = [];
  for (const w of arr) {
    const k = limpia(w);
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(w);
    }
  }
  return out;
}

/** Shuffle Fisher–Yates (mezcla real) */
function shuffle(arr = []) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

// --- Palabras semilla (tuyas + ampliación) ---
const PALABRAS_SEMILLA_USUARIO = [
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

// +300 semillas nuevas (es-ES) para historias con alma
const PALABRAS_SEMILLA_EXTRA_300 = [
  "raíz","origen","vínculo","huella","eco","latido","brújula","umbral","pulso","trama",
  "sendero","refugio","orilla","claridad","sombra","destello","silencio","susurro","mirada","presencia",
  "memoria","instante","despertar","anhelo","certeza","duda","coraje","ternura","templanza","calma",
  "fervor","asombro","cuidado","piedad","perdón","gratitud","respeto","honra","dignidad","verdad",
  "faro","norte","surco","marea","corriente","brisa","nube","llovizna","rocío","cauce",
  "río","mar","isla","puerto","vela","timón","deriva","nave","mapa","constelación",
  "cielo","horizonte","aurora","crepúsculo","medianoche","alba","ocaso","claroscuro","neblina","tormenta",
  "calima","escarcha","tránsito","estación","ciclo","ritmo","cadencia","compás","armonía","melodía",
  "nota","acorde","resonancia","vibración","canto","voz","suspiro","pausa","tempo","síncopa",
  "timbre","lira","piano","bajo","cuerda","arco","métrica","rima","pacto",
  "alianza","encuentro","despedida","abrazo","límite","frontera","puente","paso","viaje","retorno",
  "hogar","casa","nido","cobijo","tierra","barro","semilla","brote","flor","rama",
  "bosque","hoja","corteza","piedra","arena","sal","arcilla","mineral","cristal","caverna",
  "montaña","valle","ladera","senda","pradera","jardín","chispa","brasa","ceniza","calor",
  "candil","farol","ardor","forja","metal","yunque","martillo","filo","brillo","ola",
  "espuma","remanso","poza","manantial","fuente","llanto","lágrima","cascada","dique","abismo",
  "profundidad","superficie","reflejo","espejo","ventana","puerta","llave","cerradura","pasillo","escalera",
  "peldaño","altura","bóveda","techo","pared","sala","rincón","esquina","penumbra","cuerpo",
  "piel","hueso","sangre","aliento","respiración","mano","gesto","postura","nervio","músculo",
  "equilibrio","cansancio","energía","calidez","frío","niñez","infancia","juego","risa","sueño",
  "cuna","cuento","tiza","patio","cometa","canica","dibujo","verano","invierno","otoño",
  "primavera","mudanza","adulto","madurez","decisión","elección","renuncia","acuerdo","promesa","mentira",
  "secreto","confesión","revelación","pregunta","respuesta","misterio","rumor","señal","símbolo","metáfora",
  "carta","mensaje","palabra","frase","nombre","apodo","silaba","tinta","papel","pluma",
  "borrador","margen","párrafo","verso","prosa","relato","capítulo","epílogo","prólogo","narrador",
  "historia","travesía","aventura","prueba","reto","caída","ascenso","giro","nudo","desenlace",
  "destino","azar","casualidad","sincronicidad","coincidencia","presagio","augurio","rastro","pista","clave",
  "código","enigma","laberinto","salida","entrada","portal","vértigo","riesgo","audacia","osadía",
  "valentía","serenidad"
];

// Pool final: usuario + extra, sin repetidas (por normalización)
const PALABRAS_SEMILLA = uniqueByNormalized([
  ...PALABRAS_SEMILLA_USUARIO,
  ...PALABRAS_SEMILLA_EXTRA_300
]);

/**
 * Extrae del historial palabras recientes (máquina y usuario) para "mutear" repetición.
 * Historial esperado: array de turnos con { palabraMaquina, palabraUsuario } o similar.
 */
function recogeRecientes(historial, max = 18) {
  const recientes = [];
  if (!Array.isArray(historial)) return recientes;

  // Recorremos desde el final
  for (let i = historial.length - 1; i >= 0 && recientes.length < max; i--) {
    const t = historial[i] || {};
    if (t.palabraMaquina) recientes.push(limpia(t.palabraMaquina));
    if (t.palabraUsuario) recientes.push(limpia(t.palabraUsuario));
  }

  return recientes.filter(Boolean);
}

/**
 * Elige la siguiente palabra de la máquina.
 * Mezcla + Mute + Cambie:
 *  - Evita repetir palabra actual (máquina/usuario) y recientes del historial
 *  - Mezcla candidatas cada turno
 *  - A veces busca "hilo" (comparte letras) y a veces "ruptura" (casi no comparte)
 */
function elegirNuevaPalabra(palabraMaquina, palabraUsuario, historial) {
  const prohibidas = new Set([
    limpia(palabraMaquina),
    limpia(palabraUsuario),
    ...recogeRecientes(historial, 18)
  ]);

  // Base sin prohibidas
  let candidatas = PALABRAS_SEMILLA.filter((p) => !prohibidas.has(limpia(p)));
  if (candidatas.length === 0) candidatas = PALABRAS_SEMILLA.slice();

  // Mezcla real
  candidatas = shuffle(candidatas);

  const a = limpia(palabraMaquina);
  const b = limpia(palabraUsuario);

  // "Cambie": decide el modo de búsqueda
  // - 55%: buscar semilla con hilo (>=2 letras comunes con a o b)
  // - 25%: ruptura suave (0–1 letras comunes con ambos)
  // - 20%: totalmente aleatoria de las candidatas
  const r = Math.random();

  if (a || b) {
    if (r < 0.55) {
      // Semilla con hilo: comparte letras con alguna de las dos
      const conHilo = candidatas.filter((p) => {
        const cpA = a ? cuentaLetrasComunes(p, a) : 0;
        const cpB = b ? cuentaLetrasComunes(p, b) : 0;
        return Math.max(cpA, cpB) >= 2;
      });
      if (conHilo.length > 0) return conHilo[0];
    } else if (r < 0.80) {
      // Ruptura: casi nada en común con ambas (para sorpresa y oxígeno narrativo)
      const ruptura = candidatas.filter((p) => {
        const cpA = a ? cuentaLetrasComunes(p, a) : 0;
        const cpB = b ? cuentaLetrasComunes(p, b) : 0;
        return cpA <= 1 && cpB <= 1;
      });
      if (ruptura.length > 0) return ruptura[0];
    }
  }

  // Fallback: primera tras mezcla
  return candidatas[0];
}

/**
 * Cerebro principal de un turno.
 * Recibe las palabras y el historial.
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
      'Aquí casi no hay hilo. Prueba con una imagen, un recuerdo o una sensación que toque a ambas palabras.';
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

  // 3) Nueva palabra de la máquina (mezcla + mute + cambio)
  const nueva_palabra = elegirNuevaPalabra(palabraMaquina, palabraUsuario, historial);

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
