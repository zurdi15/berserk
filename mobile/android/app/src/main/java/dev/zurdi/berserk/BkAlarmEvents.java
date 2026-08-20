package dev.zurdi.berserk;

import com.getcapacitor.JSObject;

/**
 * v0.35.0 — estado de la alarma de fin para la web (zurdi: "en el móvil, en
 * vez de una pantalla específica, un overlay en la pantalla del entreno con
 * glow naranja"). BkAlarmService publica aquí cada cambio; el plugin, si el
 * WebView está vivo, lo reenvía como evento `alarmState` y la web pinta o
 * quita su overlay. La web también puede preguntar (getAlarmState) al volver.
 */
final class BkAlarmEvents {

    interface Sink {
        void onAlarmState(JSObject state);
    }

    private static volatile Sink sink;
    private static volatile JSObject current = idle();

    private BkAlarmEvents() {}

    static JSObject idle() {
        JSObject state = new JSObject();
        state.put("ringing", false);
        return state;
    }

    static void setSink(Sink newSink) {
        sink = newSink;
    }

    static JSObject current() {
        return current;
    }

    static void publish(JSObject state) {
        current = state;
        Sink s = sink;
        if (s != null) s.onAlarmState(state);
    }
}
