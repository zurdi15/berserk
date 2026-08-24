package dev.zurdi.berserk;

/**
 * v0.28.0 reloj — puente estático entre BkWearListenerService (lo enlaza Play
 * services en este mismo proceso, sin acceso al bridge de Capacitor) y el
 * plugin BkOngoing, que sí puede emitir eventos a la web. Si no hay plugin
 * cargado (WebView muerto), el evento se pierde a propósito: el servicio ya
 * hizo la limpieza nativa y la web, al volver, arranca sin descanso vivo.
 */
final class BkWearEvents {

    interface Sink {
        void onTimerCancelled(String kind);
    }

    /**
     * v0.38.0: "+ Serie" / "Terminar" desde el reloj sobre el ejercicio weid.
     * v0.39.0: con "+ Serie" viajan las reps y la carga que el usuario ajustó
     * en el reloj (reps 0 / load NaN = no tocó ese stepper).
     */
    interface ExerciseSink {
        void onExerciseCommand(String action, long weid, int reps, double load);
    }

    private static volatile Sink sink;
    private static volatile ExerciseSink exerciseSink;

    private BkWearEvents() {}

    static void setSink(Sink newSink) {
        sink = newSink;
    }

    static void setExerciseSink(ExerciseSink newSink) {
        exerciseSink = newSink;
    }

    static void emitCancelled(String kind) {
        Sink current = sink;
        if (current != null) current.onTimerCancelled(kind);
    }

    /**
     * true si había web viva que la recibiera. Si no (WebView muerto), el que
     * llama se lo dice al reloj: la orden no vale nada sin la web, que es
     * quien registra (outbox, descanso, PRs).
     */
    static boolean emitExerciseCommand(String action, long weid, int reps, double load) {
        ExerciseSink current = exerciseSink;
        if (current == null) return false;
        current.onExerciseCommand(action, weid, reps, load);
        return true;
    }
}
