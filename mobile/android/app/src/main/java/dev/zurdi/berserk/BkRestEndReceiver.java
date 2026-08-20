package dev.zurdi.berserk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * v0.13.2 — dispara cuando la alarma de fin (descanso o, desde v0.28.0,
 * cardio) llega a cero y postea la notificación SONORA (canal HIGH aparte del
 * de los cronómetros silenciosos). v0.30.0: la tarjeta bonita de
 * BkNotifications, con la imagen del ejercicio si la alarma la traía — se
 * baja en segundo plano con goAsync (un receiver tiene ~10 s).
 */
public class BkRestEndReceiver extends BroadcastReceiver {

    static final String ALERT_CHANNEL_ID = BkNotifications.CHANNEL_ALERTS;
    static final int REST_END_NOTIFICATION_ID = 1001;

    @Override
    public void onReceive(Context context, Intent intent) {
        // v0.16.0: un throw aquí también cierra el proceso entero (los
        // receivers corren en el hilo principal de la app) — mejor un aviso
        // que no suena que la app muerta
        final PendingResult pending = goAsync();
        try {
            // el cronómetro ongoing de la cuenta atrás ya no pinta nada útil
            BkNotifications.cancel(context, intent.getIntExtra("cancelNotificationId", 1002));
            BkNotifications.postEnd(
                    context,
                    intent.getIntExtra("notificationId", REST_END_NOTIFICATION_ID),
                    intent.getStringExtra("title"),
                    intent.getStringExtra("body"),
                    intent.getStringExtra("subtitle"),
                    intent.getStringExtra("channelName"),
                    intent.getStringExtra("imageUrl"),
                    pending::finish);
        } catch (Exception e) {
            pending.finish();
        }
    }
}
