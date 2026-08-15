/**
 * The curated bank: human-written affirmations that never depend on a model.
 *
 * This is load-bearing, not filler. It covers a new user's first days before
 * generation lands, a Vertex outage, a batch that failed moderation, and users
 * whose stated focus routes away from generation entirely. Every line here must
 * pass moderation.service.js unchanged — there is a test asserting exactly that.
 */

export const CATEGORIES = [
  { slug: "self-worth", name: "Self-worth", order: 1, description: "Being enough as you are." },
  { slug: "calm", name: "Calm", order: 2, description: "Slowing down and settling." },
  {
    slug: "confidence",
    name: "Confidence",
    order: 3,
    description: "Trusting yourself to act.",
  },
  {
    slug: "gratitude",
    name: "Gratitude",
    order: 4,
    description: "Noticing what is already here.",
  },
  { slug: "resilience", name: "Resilience", order: 5, description: "Getting back up." },
  { slug: "focus", name: "Focus", order: 6, description: "One thing at a time." },
  {
    slug: "relationships",
    name: "Relationships",
    order: 7,
    description: "Honesty and closeness.",
  },
  { slug: "morning", name: "Morning", order: 8, description: "Starting the day well." },
  { slug: "rest", name: "Rest", order: 9, description: "Permission to stop." },
  { slug: "growth", name: "Growth", order: 10, description: "Becoming, slowly." },
];

/**
 * The bank is per-language, and a language's bank is one of the three things it
 * needs before it can ship at all — see config/locales.js. These are written in
 * the language, not translated line by line: an affirmation that survives a
 * literal translation usually stops sounding like something a person would say.
 *
 * Every line leads with the permission-first voice (permission / specific /
 * honest) and passes moderation.service.js *in its own language* unchanged —
 * there is a test asserting exactly that.
 */
const EN = [
  ["self-worth", "I am allowed to take up space."],
  ["self-worth", "I don't have to earn my own kindness."],
  ["self-worth", "I can be enough before I am finished."],
  ["self-worth", "My worth holds steady on an unproductive day."],
  ["self-worth", "I let myself matter without a reason."],

  ["calm", "I can let the next thing wait a minute."],
  ["calm", "I'm allowed to slow down without falling behind."],
  ["calm", "My breath is somewhere steady to come back to."],
  ["calm", "I don't have to answer this feeling right away."],
  ["calm", "I let this moment be as simple as it is."],

  ["confidence", "I can begin before I feel ready."],
  ["confidence", "I'm allowed to take myself seriously."],
  ["confidence", "I get to trust my own read on this."],
  ["confidence", "I can hold a room without shrinking."],
  ["confidence", "My voice is worth the space it takes."],

  ["gratitude", "I can let one small thing today be enough."],
  ["gratitude", "I notice something quietly good in this ordinary day."],
  ["gratitude", "I get to keep the parts of today that were kind."],
  ["gratitude", "My plainest days still hold plenty worth keeping."],
  ["gratitude", "Today I let a small good thing count."],

  ["resilience", "I can carry something heavy and still take one step."],
  ["resilience", "I'm allowed to start again as many times as I need."],
  ["resilience", "My setbacks are information, not a verdict."],
  ["resilience", "I don't have to have a good week to keep going."],
  ["resilience", "I can be here, still standing, and let that count."],

  ["focus", "I do one thing at a time today."],
  ["focus", "I'm allowed to let the rest wait."],
  ["focus", "I can protect my attention without apology."],
  ["focus", "Today I choose the next small step."],
  ["focus", "I let the unfinished parts stay unfinished for now."],

  ["relationships", "I can ask for what I need in plain words."],
  ["relationships", "I'm allowed to disappoint someone and stay kind."],
  ["relationships", "My boundaries make my closeness more honest."],
  ["relationships", "I don't have to fix what I can only listen to."],
  ["relationships", "I let my presence be enough to offer."],

  ["morning", "Today I begin gently and keep going."],
  ["morning", "I don't have to feel ready to begin."],
  ["morning", "I can meet this morning without bracing for it."],
  ["morning", "I get to carry today a little more lightly."],
  ["morning", "Today I set one honest intention."],

  ["rest", "I'm allowed to stop before I am finished."],
  ["rest", "I can be still without earning it first."],
  ["rest", "My rest is part of the work, not a break from it."],
  ["rest", "I let today end unfinished."],
  ["rest", "My tiredness is a signal, not a failure."],

  ["growth", "I can be a beginner without apology."],
  ["growth", "I'm allowed to learn this slowly."],
  ["growth", "My mistakes are how I learn the shape of things."],
  ["growth", "Today I choose curiosity over being right."],
  ["growth", "I don't have to become someone else to grow."],
];

// Spanish is pro-drop, so most of these carry the first person in the verb
// rather than a pronoun — see the `es` firstPerson rule in moderation.service.js.
const ES = [
  ["self-worth", "Me permito ocupar espacio."],
  ["self-worth", "No tengo que ganarme mi propia amabilidad."],
  ["self-worth", "Puedo ser suficiente antes de terminar."],
  ["self-worth", "Mi valor se mantiene en un día improductivo."],
  ["self-worth", "Me permito importar sin dar explicaciones."],

  ["calm", "Puedo dejar que lo siguiente espere un minuto."],
  ["calm", "Me permito ir más despacio sin quedarme atrás."],
  ["calm", "Mi respiración es un lugar firme al que volver."],
  ["calm", "No tengo que responder a esto ahora mismo."],
  ["calm", "Dejo que este momento sea así de simple."],

  ["confidence", "Puedo empezar antes de sentirme preparado."],
  ["confidence", "Me permito tomarme en serio."],
  ["confidence", "Confío en mi propia lectura de esto."],
  ["confidence", "Puedo hacerlo con miedo y hacerlo igual."],
  ["confidence", "Mi voz cabe en esta conversación."],

  ["gratitude", "Agradezco algo pequeño que ya está aquí."],
  ["gratitude", "Puedo notar lo bueno sin salir a buscarlo."],
  ["gratitude", "Hoy elijo mirar lo que sí tengo."],
  ["gratitude", "Me detengo un momento a agradecer esto."],
  ["gratitude", "Mi día tiene más de lo que recuerdo."],

  ["resilience", "Puedo cargar algo difícil y aun así avanzar."],
  ["resilience", "Me permito empezar de nuevo las veces que haga falta."],
  ["resilience", "No tengo que estar entero para seguir."],
  ["resilience", "Mi paso pequeño de hoy también cuenta."],
  ["resilience", "Puedo volver a levantarme sin prisa."],

  ["focus", "Elijo una sola cosa y la empiezo."],
  ["focus", "Puedo dejar lo demás fuera por ahora."],
  ["focus", "Me permito hacer poco y hacerlo bien."],
  ["focus", "Mi atención es mía para decidir dónde ponerla."],
  ["focus", "Hoy hago lo siguiente, no todo."],

  ["relationships", "Puedo pedir lo que necesito sin disculparme."],
  ["relationships", "Me permito decir que no y seguir queriendo."],
  ["relationships", "Mi honestidad cabe en esta relación."],
  ["relationships", "Puedo estar cerca sin desaparecer."],
  ["relationships", "Dejo que mi presencia sea suficiente."],

  ["morning", "Hoy empiezo con calma y sigo."],
  ["morning", "No tengo que sentirme listo para empezar."],
  ["morning", "Puedo recibir esta mañana sin tensarme."],
  ["morning", "Hoy elijo una intención honesta."],
  ["morning", "Me permito llevar el día con más ligereza."],

  ["rest", "Me permito parar antes de terminar."],
  ["rest", "Puedo estar quieto sin habérmelo ganado."],
  ["rest", "Mi descanso es parte del trabajo."],
  ["rest", "Dejo que hoy termine sin acabar."],
  ["rest", "Mi cansancio es una señal, no un fallo."],

  ["growth", "Puedo ser principiante sin pedir perdón."],
  ["growth", "Me permito aprender esto despacio."],
  ["growth", "Mis errores me enseñan la forma de las cosas."],
  ["growth", "Hoy elijo la curiosidad antes que tener razón."],
  ["growth", "No tengo que ser otra persona para crecer."],
];

const BANKS = { en: EN, es: ES };

export const CURATED_AFFIRMATIONS = Object.entries(BANKS).flatMap(([locale, lines]) =>
  lines.map(([categorySlug, text]) => ({ categorySlug, text, locale })),
);

/** The bank for one language, for tests and for the seed. */
export const curatedFor = (locale) => CURATED_AFFIRMATIONS.filter((a) => a.locale === locale);
