package dev.zurdi.berserk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * v0.13.1 (zurdi: "notificación permanente con el tiempo de entreno, como la
 * del cronómetro"): notificaciones ongoing con CRONÓMETRO DEL SISTEMA —
 * setUsesChronometer hace que sea Android quien pinta el tiempo corriendo
 * (o la cuenta atrás con setChronometerCountDown) en la barra y en la
 * pantalla de bloqueo, sin que la app tenga que estar viva ni actualizar
 * nada. El plugin de LocalNotifications de Capacitor no expone esto, de ahí
 * este mini-plugin propio. Silenciosas a propósito (IMPORTANCE_LOW): el
 * aviso SONORO del fin de descanso sigue siendo la notificación programada
 * de LocalNotifications (ver frontend nativeShell.ts).
 */
@CapacitorPlugin(name = "BkOngoing")
public class BkOngoingPlugin extends Plugin {

    private static final String CHANNEL_ID = "berserk-ongoing";

    private NotificationManager manager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void ensureChannel(String name) {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        manager().createNotificationChannel(channel);
    }

    private PendingIntent launchIntent() {
        Intent intent = getContext().getPackageManager()
                .getLaunchIntentForPackage(getContext().getPackageName());
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                getContext(), 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private int smallIcon() {
        int res = getContext().getResources().getIdentifier(
                "ic_stat_berserk", "drawable", getContext().getPackageName());
        return res != 0 ? res : getContext().getApplicationInfo().icon;
    }

    private Notification.Builder base(String title, String text, String channelName) {
        ensureChannel(channelName);
        return new Notification.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(smallIcon())
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .setContentIntent(launchIntent())
                .setVisibility(Notification.VISIBILITY_PUBLIC);
    }

    /** Cronómetro hacia ARRIBA desde whenMs (tiempo de entreno). */
    @PluginMethod
    public void startChronometer(PluginCall call) {
        long whenMs = call.getLong("whenMs", System.currentTimeMillis());
        int id = call.getInt("id", 1003);
        Notification.Builder builder = base(
                call.getString("title", "berserk"),
                call.getString("text", ""),
                call.getString("channelName", "berserk"))
                .setWhen(whenMs)
                .setUsesChronometer(true);
        manager().notify(id, builder.build());
        call.resolve();
    }

    /** Cuenta ATRÁS hasta whenMs (descanso). */
    @PluginMethod
    public void startCountdown(PluginCall call) {
        long whenMs = call.getLong("whenMs", System.currentTimeMillis());
        int id = call.getInt("id", 1002);
        Notification.Builder builder = base(
                call.getString("title", "berserk"),
                call.getString("text", ""),
                call.getString("channelName", "berserk"))
                .setWhen(whenMs)
                .setUsesChronometer(true)
                .setChronometerCountDown(true);
        manager().notify(id, builder.build());
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        manager().cancel(call.getInt("id", 1003));
        call.resolve();
    }

    private PendingIntent endAlarmIntent(String title, String body, String channelName) {
        Intent intent = new Intent(getContext(), BkRestEndReceiver.class);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("channelName", channelName);
        return PendingIntent.getBroadcast(
                getContext(), 2001, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * v0.13.2 — aviso sonoro del fin de descanso vía setAlarmClock: EXENTO de
     * la restricción de alarmas exactas de Android 14+ (SCHEDULE_EXACT_ALARM
     * viene denegado por defecto y la programada de LocalNotifications se
     * degradaba a inexacta — para un descanso de 60s, "no llega"). El
     * receiver postea la notificación con sonido al dispararse.
     */
    @PluginMethod
    public void scheduleEndAlarm(PluginCall call) {
        long whenMs = call.getLong("whenMs", System.currentTimeMillis());
        android.app.AlarmManager alarms =
                (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        PendingIntent operation = endAlarmIntent(
                call.getString("title", "berserk"),
                call.getString("body", ""),
                call.getString("channelName", "berserk"));
        alarms.setAlarmClock(
                new android.app.AlarmManager.AlarmClockInfo(whenMs, launchIntent()), operation);
        call.resolve();
    }

    @PluginMethod
    public void cancelEndAlarm(PluginCall call) {
        android.app.AlarmManager alarms =
                (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        alarms.cancel(endAlarmIntent("", "", ""));
        // si ya se posteó (llegó a cero antes de cancelar), fuera de la barra
        manager().cancel(BkRestEndReceiver.REST_END_NOTIFICATION_ID);
        call.resolve();
    }
}
