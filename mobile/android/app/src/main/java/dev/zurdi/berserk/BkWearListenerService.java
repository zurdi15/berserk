package dev.zurdi.berserk;

import android.app.NotificationManager;
import android.content.Context;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

import java.nio.charset.StandardCharsets;

/**
 * v0.28.0 reloj — órdenes que llegan del Galaxy Watch por MessageClient.
 * Hoy solo una: cancelar una cuenta atrás (/berserk/cmd/cancel, cuerpo =
 * kind). Play services arranca este servicio aunque la app esté cerrada.
 */
public class BkWearListenerService extends WearableListenerService {

    @Override
    public void onMessageReceived(MessageEvent event) {
        if (BkWear.CMD_ACK.equals(event.getPath())) {
            BkAlarmService.stopIfRunning();
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
