// sutilia_brain.js
// --------------------------------------------
// Aquí vivirá "el cerebro" de Sutilia.
// De momento es una versión muy sencilla,
// pero ya tiene la forma que necesitamos
// para ir haciéndolo cada vez más profundo.
// --------------------------------------------

/**
 * Analiza un turno del juego y decide:
 * - la nueva palabra de la máquina
 * - la puntuación (0–10)
 * - el texto de explicación
 * - una etiqueta de rareza opcional
 *
 * IMPORTANTE:
 *  - Aquí NO hablamos con ChatGPT todavía.
 *  - De momento es una lógica sencilla para que todo funcione.
 *  - Más adelante iremos afinando la inteligencia paso a paso.
 */
function analizarTurno({ palabraMaquina, palabraUsuario, historial }) {
  const limpia = (texto) =>
    (texto || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // quita tildes

  const maquina = limpia(palabraMaquina);
  const usuario = limpia(palabraUsuario);

  // --- 1. Comprobar si hay "hilo" mínimo ---
  // Muy simple de momento: si comparten al menos 3 letras distintas,
  // asumimos que hay algo de conexión. Luego lo mejoraremos.
  const letrasMaq = new Set(maquina.split(""));
  const letrasUsu = new Set(usuario.split(""));

  let comunes = 0;
  letrasUsu.forEach((letra) => {
    if (letrasMaq.has(letra)) comunes++;
  });

  let puntuacion;
  let comentarioHilo;

  if (comunes === 0) {
    puntuacion = 1;
    comentarioHilo =
      "Aquí casi no hay hilo entre ambas palabras. Prueba a buscar una imagen o una sensación común.";
  } else if (comunes === 1) {
    puntuacion = 3;
    comentarioHilo =
      "Hay un hilo muy fino, casi invisible. Se intuye algo, pero todavía puedes hilar más delicado.";
  } else if (comunes === 2) {
    puntuacion = 6;
    comentarioHilo =
      "El hilo empieza a sentirse. No es obvio, pero tampoco muy lejano. Buen terreno para seguir jugando.";
  } else {
    puntuacion = 8;
    comentarioHilo =
      "El hilo se siente vivo. No es directo, pero la conexión puede contarse como pequeña historia.";
  }

  // --- 2. Elegir la siguiente palabra de la máquina ---
  // De momento: repite la misma palabra.
  // Más adelante: aquí pondremos la lógica poética / GPT.
  const nuevaPalabra = palabraMaquina;

  // --- 3. Rareza estética (solo para colorear la interfaz) ---
  let rareza = null;
  if (puntuacion >= 8) rareza = "evocadora";
  else if (puntuacion >= 5) rareza = "inusual";
  else rareza = "comun";

  // --- 4. Texto de explicación final ---
  const explicacion =
    comentarioHilo +
    " (Lógica interna todavía sencilla: pronto este lugar será mucho más poético y narrativo.)";

  return {
    nueva_palabra: nuevaPalabra,
    puntuacion,
    explicacion,
    rareza,
  };
}

// Exportamos la función para poder usarla desde index.js
module.exports = {
  analizarTurno,
};
