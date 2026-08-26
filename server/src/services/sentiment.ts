/**
 * Analizador de sentimiento heurístico para español, basado en un léxico propio
 * (sin servicios externos ni modelos de pago). Adecuado para clasificar el tono
 * general de titulares y descripciones de noticias/menciones; no sustituye un
 * análisis lingüístico completo.
 */

type Lexicon = Record<string, number>;

// Palabras positivas: peso 1 (leve) a 3 (fuerte). Sin acentos (el texto se normaliza antes de comparar).
const POSITIVE: Lexicon = {
  exito: 3, exitoso: 3, excelente: 3, extraordinario: 3, sobresaliente: 3, historico: 2,
  logro: 2, logra: 2, avance: 2, avanza: 2, progreso: 2, mejora: 2, mejoras: 2, mejoro: 2,
  crecimiento: 2, crece: 2, beneficio: 2, beneficia: 2, beneficios: 2, oportunidad: 1,
  inversion: 1, invierte: 1, aprueba: 2, aprobado: 2, aprobacion: 2, acuerdo: 1, alianza: 1,
  colaboracion: 1, apoyo: 1, apoya: 1, respaldo: 1, respalda: 1, reconoce: 2, reconocimiento: 2,
  elogia: 2, elogio: 2, felicita: 2, celebra: 2, celebracion: 2, satisfaccion: 2, satisfecho: 2,
  positivo: 2, positiva: 2, bueno: 1, buena: 1, buenas: 1, buenos: 1, gran: 1, grandes: 1,
  importante: 1, innovacion: 2, innovador: 2, moderniza: 2, modernizacion: 2, transparencia: 2,
  eficiencia: 2, eficiente: 2, calidad: 1, solucion: 1, resuelve: 2, resolvio: 2, garantiza: 1,
  seguro: 1, seguridad: 1, fortalece: 2, fortalecimiento: 2, impulsa: 1, impulso: 1, record: 2,
  supera: 2, superan: 2, cumple: 1, cumplimiento: 1, transformacion: 1, expansion: 1,
  amplia: 1, ampliacion: 1, beneficiara: 2, esperanza: 1, optimismo: 2, confianza: 1, estable: 1,
  estabilidad: 1, recuperacion: 1, recupera: 1, gratis: 1, gratuito: 1, gratuita: 1, alegria: 2,
  agradece: 1, agradecimiento: 1, premio: 2, premiado: 2, galardon: 2, destaca: 1, destacado: 1,
};

// Palabras negativas: peso -1 (leve) a -3 (fuerte).
const NEGATIVE: Lexicon = {
  crisis: -3, escandalo: -3, corrupcion: -3, fraude: -3, desastre: -3, catastrofe: -3,
  fracaso: -3, fracasa: -3, falla: -2, fallas: -2, fallo: -2, denuncia: -2, denuncian: -2,
  acusa: -2, acusacion: -2, acusado: -2, investigacion: -1, investigan: -1, protesta: -2,
  protestan: -2, rechaza: -2, rechazo: -2, critica: -2, criticas: -2, criticado: -2,
  queja: -2, quejas: -2, molestia: -1, molesto: -1, deficiente: -2, deficiencia: -2,
  retraso: -2, retrasa: -2, retrasos: -2, demora: -1, demoras: -1, problema: -2, problemas: -2,
  conflicto: -2, conflictos: -2, violencia: -3, corrupto: -3, ilegal: -2, irregularidad: -2,
  irregularidades: -2, incumple: -2, incumplimiento: -2, negligencia: -3, abuso: -2, abusos: -2,
  robo: -3, roban: -3, muerte: -3, muere: -3, mueren: -3, accidente: -2, accidentes: -2,
  emergencia: -1, alerta: -1, riesgo: -1, riesgos: -1, peligro: -2, peligroso: -2, malo: -1,
  mala: -1, malas: -1, malos: -1, pesimo: -3, terrible: -3, grave: -2, gravedad: -2,
  preocupacion: -2, preocupa: -2, preocupante: -2, dano: -2, danos: -2, daña: -2, afecta: -1,
  afectados: -1, perjudica: -2, perjuicio: -2, colapso: -3, colapsa: -3, deficit: -1,
  perdida: -2, perdidas: -2, pierde: -1, cierre: -1, cierra: -1, despido: -2, despidos: -2,
  huelga: -2, paro: -1, escasez: -2, contaminacion: -2, corte: -1, cortes: -1, apagon: -2,
  interrupcion: -1, sancion: -2, sancionado: -2, multa: -2, multado: -2, tension: -1,
  tensiones: -1, disputa: -1, polemica: -2, polemico: -2, indignacion: -2, indignado: -2,
};

const NEGATORS = new Set(['no', 'nunca', 'jamas', 'sin', 'tampoco', 'ni', 'ningun', 'ninguna', 'ningunos', 'ningunas']);
const INTENSIFIERS: Record<string, number> = { muy: 1.5, sumamente: 1.8, extremadamente: 2, totalmente: 1.5 };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

export type SentimentLabel = 'EXCELLENT' | 'GOOD' | 'BAD' | 'NEUTRAL';

export interface SentimentResult {
  score: number;
  label: SentimentLabel;
  positiveMatches: number;
  negativeMatches: number;
}

/** Analiza el tono de un texto en español. Determinista, sin llamadas externas. */
export function analyzeSentiment(text: string): SentimentResult {
  const words = normalize(text).split(/\s+/).filter(Boolean);

  let score = 0;
  let positiveMatches = 0;
  let negativeMatches = 0;
  let negateNext = false;
  let intensifyNext = 1;

  for (const word of words) {
    if (NEGATORS.has(word)) {
      negateNext = true;
      continue;
    }
    if (INTENSIFIERS[word]) {
      intensifyNext = INTENSIFIERS[word];
      continue;
    }

    let weight = POSITIVE[word] ?? (NEGATIVE[word] !== undefined ? NEGATIVE[word] : 0);
    if (weight !== 0) {
      weight *= intensifyNext;
      if (negateNext) weight *= -1;
      score += weight;
      if (weight > 0) positiveMatches++;
      else negativeMatches++;
      // Negation/intensifiers apply to the next sentiment word found, skipping
      // filler words in between (e.g. "no hubo ningún avance positivo").
      negateNext = false;
      intensifyNext = 1;
    }
  }

  let label: SentimentLabel;
  if (score >= 3) label = 'EXCELLENT';
  else if (score > 0) label = 'GOOD';
  else if (score < 0) label = 'BAD';
  else label = 'NEUTRAL';

  return { score, label, positiveMatches, negativeMatches };
}
