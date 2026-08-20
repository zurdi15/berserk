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

    private PendingIntent launchIntent() {
        Intent intent = getContext().getPackageManager()
                .getLaunchIntentForPackage(getContext().getPackageName());
        if (intent == null) return null;
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                getContext(), 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Cronómetro hacia ARRIBA desde whenMs (tiempo de entreno). v0.30.0: la
     * tarjeta la monta BkNotifications (imagen + cronómetro grande); subtitle
     * e imageUrl son opcionales (bundles anteriores no los mandan).
     */
    @PluginMethod
    public void startChronometer(PluginCall call) {
        try {
            BkNotifications.postTimer(
                    getContext(),
                    call.getInt("id", 1003),
                    call.getString("title", "berserk"),
                    call.getString("subtitle", ""),
                    call.getLong("whenMs", System.currentTimeMillis()),
                    false,
                    call.getString("channelName", "berserk"),
                    call.getString("imageUrl", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    /** Cuenta ATRÁS hasta whenMs (descanso, cardio). */
    @PluginMethod
    public void startCountdown(PluginCall call) {
        try {
            BkNotifications.postTimer(
                    getContext(),
                    call.getInt("id", 1002),
                    call.getString("title", "berserk"),
                    call.getString("subtitle", ""),
                    call.getLong("whenMs", System.currentTimeMillis()),
                    true,
                    call.getString("channelName", "berserk"),
                    call.getString("imageUrl", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            BkNotifications.cancel(getContext(), call.getInt("id", 1003));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    // v0.28.0: la misma alarma sirve para el fin de CARDIO — request code e
    // ids propios (los fija nativeShell.ts) para que no se pise con la del
    // descanso. Sin parámetros, todo cae a los valores del descanso de siempre.
    static final int REST_END_REQUEST_CODE = 2001;

    private PendingIntent endAlarmIntent(
            int requestCode, String title, String body, String channelName,
            int notificationId, int cancelNotificationId, String subtitle, String imageUrl) {
        Intent intent = new Intent(getContext(), BkRestEndReceiver.class);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("channelName", channelName);
        intent.putExtra("notificationId", notificationId);
        intent.putExtra("cancelNotificationId", cancelNotificationId);
        // v0.30.0: la tarjeta del fin lleva el ejercicio y su imagen
        intent.putExtra("subtitle", subtitle);
        intent.putExtra("imageUrl", imageUrl);
        return PendingIntent.getBroadcast(
                getContext(), requestCode, intent,
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
                    call.getInt("requestCode", REST_END_REQUEST_CODE),
                    call.getString("title", "berserk"),
                    call.getString("body", ""),
                    call.getString("channelName", "berserk"),
                    call.getInt("notificationId", BkRestEndReceiver.REST_END_NOTIFICATION_ID),
                    call.getInt("cancelNotificationId", 1002),
                    call.getString("subtitle", ""),
                    call.getString("imageUrl", ""));
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
            cancelEndAlarmNative(
                    getContext(),
                    call.getInt("requestCode", REST_END_REQUEST_CODE),
                    call.getInt("notificationId", BkRestEndReceiver.REST_END_NOTIFICATION_ID));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    /**
     * v0.28.0 reloj — cancelar una alarma de fin SIN bridge: lo usa también
     * BkWearListenerService cuando el Galaxy Watch cancela una cuenta atrás
     * y el WebView puede estar muerto. El PendingIntent casa por componente
     * + request code, no por extras, así que vale uno vacío.
     */
    static void cancelEndAlarmNative(Context context, int requestCode, int notificationId) {
        android.app.AlarmManager alarms =
                (android.app.AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, BkRestEndReceiver.class);
        PendingIntent operation = PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.cancel(operation);
        // si ya se posteó (llegó a cero antes de cancelar), fuera de la barra
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(notificationId);
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

    // ---------- reloj Wear OS (v0.28.0) — ver BkWear.java ----------

    @Override
    public void load() {
        // BkWearListenerService corre en este proceso pero sin bridge: le
        // dejamos un sumidero para que una cancelación desde el reloj llegue
        // a la web como evento del plugin (nativeShell.onWearTimerCancelled)
        BkWearEvents.setSink(kind -> {
            JSObject data = new JSObject();
            data.put("kind", kind);
            getBridge().executeOnMainThread(() -> notifyListeners("timerCancelled", data, true));
        });
    }

    @Override
    protected void handleOnDestroy() {
        BkWearEvents.setSink(null);
    }

    /** Publica el estado de un temporizador para el reloj (DataItem /berserk/timer/&lt;kind&gt;). */
    @PluginMethod
    public void syncTimer(PluginCall call) {
        try {
            String kind = call.getString("kind", "");
            String state = call.getString("state", "");
            if (!BkWear.isKind(kind) || !BkWear.isState(state)) {
                call.reject("syncTimer: kind/state inválidos");
                return;
            }
            long targetEpochMs = call.getLong("targetEpochMs", 0L);
            long totalMs = call.getLong("totalMs", 0L);
            String title = call.getString("title", "");
            String reason = call.getString("reason", "");
            BkWear.publishTimer(getContext(), kind, state, targetEpochMs, totalMs, title, reason);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    /** Estado del enlace con el reloj (Play services, reloj conectado, app instalada). */
    @PluginMethod
    public void getWearStatus(PluginCall call) {
        try {
            BkWear.status(getContext(), call);
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }
}
