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

    private static volatile Sink sink;

    private BkWearEvents() {}

    static void setSink(Sink newSink) {
        sink = newSink;
    }

    static void emitCancelled(String kind) {
        Sink current = sink;
        if (current != null) current.onTimerCancelled(kind);
    }
}
