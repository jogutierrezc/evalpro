// Interruptor central de las funciones de IA.
// Mientras sea false: no se llama a ningún modelo (OpenRouter / Gemini) y la interfaz que las usa queda oculta.
// Las claves de API no deben vivir en el cliente; reactivar esto requiere antes mover las llamadas al backend.
export const AI_ENABLED = false;
