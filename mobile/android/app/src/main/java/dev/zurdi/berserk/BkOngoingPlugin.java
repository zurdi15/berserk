package dev.zurdi.berserk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
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
 *
 * v0.16.0 — TODO método captura sus excepciones y hace call.reject: el
 * Bridge de Capacitor relanza cualquier excepción de un @PluginMethod como
 * RuntimeException en su handler thread (Bridge.callPluginMethod), o sea que
 * un throw aquí NO es un error recuperable: cierra la app entera. Así se nos
 * cerraba al registrar una serie (SecurityException de setAlarmClock, ver
 * scheduleEndAlarm).
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
        if (intent == null) return null;
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
        try {
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
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    /** Cuenta ATRÁS hasta whenMs (descanso). */
    @PluginMethod
    public void startCountdown(PluginCall call) {
        try {
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
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            manager().cancel(call.getInt("id", 1003));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
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
     * v0.13.2 — aviso sonoro del fin de descanso vía setAlarmClock (la
     * programada de LocalNotifications se degradaba a inexacta y "no
     * llegaba" para un descanso de 60s). v0.16.0 — setAlarmClock NO está
     * exento del permiso de alarmas exactas como creíamos: en Android 13+
     * exige SCHEDULE_EXACT_ALARM o USE_EXACT_ALARM y sin ellos lanza
     * SecurityException, que el Bridge convierte en cierre de la app (el
     * crash de zurdi al registrar serie). El manifest declara ahora
     * USE_EXACT_ALARM (concedido en la instalación para apps de
     * alarmas/timers — un timer de descanso lo es) y aun así, si el sistema
     * lo negara, degradamos a alarma inexacta antes que tirar la app.
     */
    @PluginMethod
    public void scheduleEndAlarm(PluginCall call) {
        try {
            long whenMs = call.getLong("whenMs", System.currentTimeMillis());
            android.app.AlarmManager alarms =
                    (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            PendingIntent operation = endAlarmIntent(
                    call.getString("title", "berserk"),
                    call.getString("body", ""),
                    call.getString("channelName", "berserk"));
            boolean exactAllowed = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
            if (exactAllowed) {
                try {
                    alarms.setAlarmClock(
                            new android.app.AlarmManager.AlarmClockInfo(whenMs, launchIntent()),
                            operation);
                } catch (SecurityException e) {
                    // cinturón y tirantes: canScheduleExactAlarms mintió
                    inexactAlarm(alarms, whenMs, operation);
                }
            } else {
                inexactAlarm(alarms, whenMs, operation);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    /** Alarma inexacta: llega "pronto", nunca crashea (setAndAllowWhileIdle es API 23+, minSdk 22). */
    private static void inexactAlarm(
            android.app.AlarmManager alarms, long whenMs, PendingIntent operation) {
        if (Build.VERSION.SDK_INT >= 23) {
            alarms.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, whenMs, operation);
        } else {
            alarms.set(android.app.AlarmManager.RTC_WAKEUP, whenMs, operation);
        }
    }

    @PluginMethod
    public void cancelEndAlarm(PluginCall call) {
        try {
            android.app.AlarmManager alarms =
                    (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            alarms.cancel(endAlarmIntent("", "", ""));
            // si ya se posteó (llegó a cero antes de cancelar), fuera de la barra
            manager().cancel(BkRestEndReceiver.REST_END_NOTIFICATION_ID);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    /**
     * v0.16.0 (zurdi: "haz que la propia apk te avise para actualizarse"):
     * la versión INSTALADA del shell. El frontend (bundle del servidor,
     * siempre al día) la compara con la suya y avisa si la APK va por
     * detrás. La PRESENCIA de este método hace además de marca de capacidad
     * en nativeShell.ts: un shell que lo tiene ya no crashea con
     * scheduleEndAlarm.
     */
    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            String versionName = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0).versionName;
            JSObject result = new JSObject();
            result.put("versionName", versionName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    /**
     * v0.16.0 — abrir una URL en el NAVEGADOR del sistema (la descarga de
     * la APK nueva desde GitHub). El WebView del shell navega dentro de la
     * app; un Intent ACTION_VIEW explícito es la única forma determinista
     * de salir de ella.
     */
    @PluginMethod
    public void openUrl(PluginCall call) {
        try {
            String url = call.getString("url", "");
            if (url.isEmpty()) {
                call.reject("url required");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }
}
