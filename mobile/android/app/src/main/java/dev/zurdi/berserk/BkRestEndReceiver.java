package dev.zurdi.berserk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * v0.13.2 — dispara cuando la alarma del fin de descanso llega a cero
 * (AlarmManager.setAlarmClock, ver BkOngoingPlugin.scheduleEndAlarm) y
 * postea la notificación SONORA. Canal HIGH aparte del de los cronómetros
 * silenciosos: aquí sí queremos sonido, vibración y heads-up.
 */
public class BkRestEndReceiver extends BroadcastReceiver {

    static final String ALERT_CHANNEL_ID = "berserk-alerts";
    static final int REST_END_NOTIFICATION_ID = 1001;

    @Override
    public void onReceive(Context context, Intent intent) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        NotificationChannel channel = new NotificationChannel(
                ALERT_CHANNEL_ID,
                intent.getStringExtra("channelName"),
                NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);

        int icon = context.getResources().getIdentifier(
                "ic_stat_berserk", "drawable", context.getPackageName());
        if (icon == 0) icon = context.getApplicationInfo().icon;

        Intent launch = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context, 1, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new Notification.Builder(context, ALERT_CHANNEL_ID)
                .setSmallIcon(icon)
                .setContentTitle(intent.getStringExtra("title"))
                .setContentText(intent.getStringExtra("body"))
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .build();
        manager.notify(REST_END_NOTIFICATION_ID, notification);

        // el cronómetro ongoing de la cuenta atrás ya no pinta nada útil
        manager.cancel(1002);
    }
}
