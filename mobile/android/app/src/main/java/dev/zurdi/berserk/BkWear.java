package dev.zurdi.berserk;

import android.content.Context;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * v0.28.0 reloj (zurdi: "vamos directamente a por la C, la experiencia más
 * robusta"): el móvil publica el estado de CADA temporizador como un DataItem
 * de la Wear OS Data Layer (/berserk/timer/&lt;kind&gt;) y la app del reloj
 * (mobile/wear, mismo applicationId y misma firma — requisito de la Data
 * Layer) lo pinta con la Ongoing Activity API. Un DataItem por kind para que
 * un stopped del descanso nunca pise el crono del entreno; el DataItem
 * persiste y se sincroniza cuando el reloj vuelve a estar al alcance, a
 * diferencia de un mensaje (MessageClient es best-effort y solo a nodos
 * conectados). Contrato espejo de mobile/wear core/TimerSpec.kt y de
 * frontend nativeShell.ts::syncWearTimer.
 */
final class BkWear {

    static final String TAG = "BkWear";
    static final String CAPABILITY_WATCH = "berserk_watch";
    static final String PATH_PREFIX = "/berserk/timer/";
    static final String CMD_CANCEL = "/berserk/cmd/cancel";
    /** v0.34.0: el OK del reloj calla la alarma del móvil */
    static final String CMD_ACK = "/berserk/cmd/ack";
    // v0.37.1: ping de reloj del watch (cuerpo = su monotónico) y nuestra respuesta (t0 + nuestro epoch)
    static final String CMD_CLOCK = "/berserk/cmd/clock";
    static final String PATH_CLOCK_PONG = "/berserk/clock/pong";
    // v0.38.0: el ejercicio actual (DataItem) y las órdenes del reloj sobre él
    // (mensajes, cuerpo = weid en decimal); undelivered = la web no estaba
    // viva para recibirla, para que el reloj avise en vez de quedarse mudo
    static final String PATH_EXERCISE = "/berserk/exercise";
    static final String CMD_LOG_SET = "/berserk/cmd/logSet";
    static final String CMD_COMPLETE_EXERCISE = "/berserk/cmd/completeExercise";
    static final String PATH_CMD_UNDELIVERED = "/berserk/cmd/undelivered";
    static final int SCHEMA = 1;

    // ids de las notificaciones ongoing del móvil que el reloj puede cancelar
    // (los fija frontend nativeShell.ts: REST_COUNTDOWN_ID / CARDIO_COUNTDOWN_ID)
    static final int NOTIF_REST_COUNTDOWN = 1002;
    static final int NOTIF_CARDIO_COUNTDOWN = 1004;
    // fin de cardio (alarma + notificación sonora), espejo de nativeShell.ts
    static final int CARDIO_END_REQUEST_CODE = 2002;
    static final int NOTIF_CARDIO_END = 1005;

    private BkWear() {}

    static boolean isKind(String kind) {
        return "rest".equals(kind) || "cardio".equals(kind) || "workout".equals(kind);
    }

    static boolean isState(String state) {
        return "running".equals(state) || "stopped".equals(state);
    }

    static boolean playServicesAvailable(Context ctx) {
        return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(ctx) == ConnectionResult.SUCCESS;
    }

    /** Publica (o sustituye) el DataItem del temporizador. Fire-and-forget: un fallo solo se loguea. */
    static void publishTimer(Context ctx, String kind, String state, long targetEpochMs, long totalMs, String title, String reason) {
        if (!playServicesAvailable(ctx)) return;
        PutDataMapRequest request = PutDataMapRequest.create(PATH_PREFIX + kind);
        DataMap map = request.getDataMap();
        map.putInt("schema", SCHEMA);
        map.putString("kind", kind);
        map.putString("state", state);
        map.putLong("targetEpochMs", targetEpochMs);
        map.putLong("totalMs", totalMs);
        map.putString("title", title == null ? "" : title);
        // v0.29.0: con stopped, "finished" (terminó solo: el reloj sigue
        // avisando hasta el OK) o "cancelled" (paró el usuario: calla)
        map.putString("reason", reason == null ? "" : reason);
        // hace único cada arranque (dos descansos idénticos seguidos también
        // disparan onDataChanged) y permite al reloj medir el desfase de relojes
        map.putLong("sentAtEpochMs", System.currentTimeMillis());
        request.setUrgent();
        Wearable.getDataClient(ctx)
                .putDataItem(request.asPutDataRequest())
                .addOnFailureListener(e -> Log.w(TAG, "DataItem " + kind + " no publicado", e));
    }

    /**
     * v0.38.0: el ejercicio actual del entreno, para la página de ejercicio
     * del reloj. Un único DataItem (/berserk/exercise) que la web sustituye
     * con cada cambio; state 'none' lo vacía (sin entreno, bloque hecho).
     * Espejo de mobile/wear core/ExerciseSpec.kt y nativeShell.syncWearExercise.
     */
    static void publishExercise(Context ctx, String state, long weid, String name, int setsDone, int setsTarget,
                                String nextLabel, boolean canLog, boolean completed,
                                int reps, String loadMode, double load, String loadUnit,
                                double loadStep, double loadMin, double loadMax) {
        if (!playServicesAvailable(ctx)) return;
        PutDataMapRequest request = PutDataMapRequest.create(PATH_EXERCISE);
        DataMap map = request.getDataMap();
        map.putInt("schema", SCHEMA);
        map.putString("state", state);
        map.putLong("weid", weid);
        map.putString("name", name == null ? "" : name);
        map.putInt("setsDone", setsDone);
        map.putInt("setsTarget", setsTarget);
        map.putString("nextLabel", nextLabel == null ? "" : nextLabel);
        map.putBoolean("canLog", canLog);
        map.putBoolean("completed", completed);
        // v0.39.0 (zurdi: "cambiar los pesos/niveles y las reps desde el
        // reloj"): la siguiente serie desglosada para los steppers — reps 0 =
        // sin stepper; loadMode none = sin carga. La carga va en unidades de
        // pantalla (o nivel) tal y como la web la enseña: el reloj no convierte.
        map.putInt("reps", reps);
        map.putString("loadMode", loadMode == null ? "none" : loadMode);
        map.putDouble("load", load);
        map.putString("loadUnit", loadUnit == null ? "" : loadUnit);
        map.putDouble("loadStep", loadStep);
        map.putDouble("loadMin", loadMin);
        map.putDouble("loadMax", loadMax);
        map.putLong("sentAtEpochMs", System.currentTimeMillis());
        request.setUrgent();
        Wearable.getDataClient(ctx)
                .putDataItem(request.asPutDataRequest())
                .addOnFailureListener(e -> Log.w(TAG, "DataItem exercise no publicado", e));
    }

    /**
     * Estado del enlace para la tarjeta de ajustes: ¿hay Play services?, ¿hay
     * un reloj conectado?, ¿tiene la app de berserk (capacidad berserk_watch)?
     * Siempre resuelve (nunca rechaza): un fallo en cualquier paso deja los
     * booleanos que ya se sabían.
     */
    static void status(Context ctx, PluginCall call) {
        JSObject out = new JSObject();
        boolean gms = playServicesAvailable(ctx);
        out.put("playServices", gms);
        out.put("connected", false);
        out.put("appInstalled", false);
        out.put("watchName", JSONObject.NULL);
        if (!gms) {
            call.resolve(out);
            return;
        }
        Wearable.getNodeClient(ctx).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    out.put("connected", !nodes.isEmpty());
                    Node any = pick(nodes);
                    if (any != null) out.put("watchName", any.getDisplayName());
                    Wearable.getCapabilityClient(ctx)
                            .getCapability(CAPABILITY_WATCH, CapabilityClient.FILTER_REACHABLE)
                            .addOnSuccessListener(info -> {
                                Node withApp = pick(new ArrayList<>(info.getNodes()));
                                out.put("appInstalled", withApp != null);
                                if (withApp != null) out.put("watchName", withApp.getDisplayName());
                                call.resolve(out);
                            })
                            .addOnFailureListener(e -> call.resolve(out));
                })
                .addOnFailureListener(e -> call.resolve(out));
    }

    private static Node pick(List<Node> nodes) {
        for (Node node : nodes) {
            if (node.isNearby()) return node;
        }
        return nodes.isEmpty() ? null : nodes.get(0);
    }
}
