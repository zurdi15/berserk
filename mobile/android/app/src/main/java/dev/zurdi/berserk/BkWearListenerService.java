package dev.zurdi.berserk;

import android.app.NotificationManager;
import android.content.Context;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Wearable;
import com.google.android.gms.wearable.WearableListenerService;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * v0.28.0 reloj — órdenes que llegan del Galaxy Watch por MessageClient:
 * cancelar una cuenta atrás (/berserk/cmd/cancel, cuerpo = kind), el OK de la
 * alarma (v0.34.0), el ping de reloj (v0.37.1) y, desde v0.38.0, registrar la
 * siguiente serie o dar por hecho el ejercicio actual (cuerpo = weid). Play
 * services arranca este servicio aunque la app esté cerrada.
 */
public class BkWearListenerService extends WearableListenerService {

    @Override
    public void onMessageReceived(MessageEvent event) {
        if (BkWear.CMD_CLOCK.equals(event.getPath())) {
            // v0.37.1 (zurdi: "el del reloj suele ir unos segundos por delante"):
            // el reloj mide el desfase de relojes con ida y vuelta — se le
            // devuelve su t0 tal cual y nuestro epoch lo más tarde posible
            byte[] data = event.getData();
            if (data == null || data.length < 8) return;
            long t0 = ByteBuffer.wrap(data).getLong();
            byte[] reply = ByteBuffer.allocate(16).putLong(t0).putLong(System.currentTimeMillis()).array();
            Wearable.getMessageClient(getApplicationContext())
                    .sendMessage(event.getSourceNodeId(), BkWear.PATH_CLOCK_PONG, reply);
            return;
        }
        if (BkWear.CMD_ACK.equals(event.getPath())) {
            // v0.38.0: el OK del reloj calla la alarma de SU tipo, no la otra
            String acked = event.getData() == null ? "" : new String(event.getData(), StandardCharsets.UTF_8).trim();
            BkAlarmService.stopIfRunning(BkWear.isKind(acked) ? acked : null);
            return;
        }
        if (BkWear.CMD_LOG_SET.equals(event.getPath()) || BkWear.CMD_COMPLETE_EXERCISE.equals(event.getPath())) {
            // v0.38.0 (zurdi: "añadir serie desde el reloj y poder finalizar
            // ejercicio"): la orden viaja a la web con el weid que el reloj tenía
            // en pantalla. Sin WebView vivo no hay quien registre: se le dice al
            // reloj (undelivered) para que avise en vez de quedarse esperando.
            long weid;
            try {
                weid = Long.parseLong(new String(event.getData(), StandardCharsets.UTF_8).trim());
            } catch (RuntimeException e) {
                return;
            }
            String action = BkWear.CMD_LOG_SET.equals(event.getPath()) ? "logSet" : "complete";
            if (!BkWearEvents.emitExerciseCommand(action, weid)) {
                Wearable.getMessageClient(getApplicationContext())
                        .sendMessage(event.getSourceNodeId(), BkWear.PATH_CMD_UNDELIVERED, event.getData());
            }
            return;
        }
        if (!BkWear.CMD_CANCEL.equals(event.getPath())) return;
        String kind = new String(event.getData(), StandardCharsets.UTF_8).trim();
        if (!BkWear.isKind(kind)) return;
        Context ctx = getApplicationContext();
        try {
            // Limpieza NATIVA aunque el WebView esté muerto o sin abrir: la
            // notificación ongoing del móvil de ese temporizador y, si es un
            // descanso, la alarma sonora; y se publica el stopped para que
            // móvil y reloj converjan (el DataItem es la verdad compartida).
            NotificationManager manager =
                    (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if ("rest".equals(kind)) {
                manager.cancel(BkWear.NOTIF_REST_COUNTDOWN);
                BkOngoingPlugin.cancelEndAlarmNative(
                        ctx, BkOngoingPlugin.REST_END_REQUEST_CODE, BkRestEndReceiver.REST_END_NOTIFICATION_ID);
            } else if ("cardio".equals(kind)) {
                manager.cancel(BkWear.NOTIF_CARDIO_COUNTDOWN);
                BkOngoingPlugin.cancelEndAlarmNative(
                        ctx, BkWear.CARDIO_END_REQUEST_CODE, BkWear.NOTIF_CARDIO_END);
            } else {
                // el entreno no se termina desde el reloj
                return;
            }
            BkWear.publishTimer(ctx, kind, "stopped", 0L, 0L, "", "cancelled");
        } catch (Exception ignored) {
            // un throw aquí tumba el proceso (ver BkOngoingPlugin): nunca
        }
        // y si la web está viva, que su store haga clear() (CTA, vibración…)
        BkWearEvents.emitCancelled(kind);
    }
}
