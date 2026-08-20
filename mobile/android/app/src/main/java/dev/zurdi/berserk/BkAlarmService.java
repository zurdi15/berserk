package dev.zurdi.berserk;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * v0.34.0 (zurdi: "en la apk del móvil quiero el mismo comportamiento que en
 * el reloj: que vibre hasta que el user le dé a OK"). Mismo diseño que
 * AlarmService en mobile/wear: servicio de primer plano de tipo shortService
 * (tope del sistema 3 min; el nuestro 60 s) arrancado desde la alarma exacta
 * de fin (BkRestEndReceiver) — arranque exento de la restricción de
 * foreground services en segundo plano —, vibración en bucle como ALARMA y
 * tres caminos para el OK: la pantalla nativa que se abre sola (full-screen
 * intent, BkAlarmActivity), la acción de la notificación y descartarla. El
 * OK también calla la alarma del reloj (publica el stopped/cancelled) y el
 * del reloj llega aquí por BkWearListenerService.
 */
public class BkAlarmService extends Service {

    static final String ACTION_START = "dev.zurdi.berserk.ALARM_START";
    static final String ACTION_ACK = "dev.zurdi.berserk.ALARM_ACK";
    static final String EXTRA_KIND = "kind";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";
    static final String EXTRA_SUBTITLE = "subtitle";
    static final String EXTRA_IMAGE_URL = "imageUrl";
    static final String EXTRA_CHANNEL_NAME = "channelName";
    static final String EXTRA_NOTIFICATION_ID = "notificationId";
    static final long ALARM_MAX_MS = 60_000L;
    private static final String TAG = "BkWear";
    // dos pulsos largos y una pausa, como en el reloj
    private static final long[] PATTERN = {0, 450, 250, 450, 900};

    private static volatile BkAlarmService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> acknowledge(true);
    private String kind;
    private int notificationId;
    private String title;
    private String subtitle;
    private String imageUrl;
    private String channelName;

    /** Pide el arranque; el fallback a aviso único vive dentro (startForeground puede negarse). */
    static boolean start(Context ctx, String kind, int notificationId, String title, String body,
                         String subtitle, String channelName, String imageUrl) {
        try {
            Intent intent = new Intent(ctx, BkAlarmService.class)
                    .setAction(ACTION_START)
                    .putExtra(EXTRA_KIND, kind)
                    .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                    .putExtra(EXTRA_TITLE, title)
                    .putExtra(EXTRA_BODY, body)
                    .putExtra(EXTRA_SUBTITLE, subtitle)
                    .putExtra(EXTRA_CHANNEL_NAME, channelName)
                    .putExtra(EXTRA_IMAGE_URL, imageUrl);
            ContextCompat.startForegroundService(ctx, intent);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "no se pudo arrancar BkAlarmService", e);
            return false;
        }
    }

    /** Una serie nueva, un cancelar o el OK del reloj: fuera la alarma (idempotente). */
    static void stopIfRunning() {
        BkAlarmService current = instance;
        if (current != null) current.finish(true);
    }

    static boolean isRinging(String kind) {
        BkAlarmService current = instance;
        return current != null && kind != null && kind.equals(current.kind);
    }

    static PendingIntent ackIntent(Context ctx, String kind) {
        Intent intent = new Intent(ctx, BkAlarmService.class)
                .setAction(ACTION_ACK)
                .putExtra(EXTRA_KIND, kind);
        return PendingIntent.getService(
                ctx, 4101 + ("cardio".equals(kind) ? 1 : 0), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_ACK.equals(action)) {
            acknowledge(false);
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        kind = intent.getStringExtra(EXTRA_KIND);
        notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, BkRestEndReceiver.REST_END_NOTIFICATION_ID);
        title = intent.getStringExtra(EXTRA_TITLE);
        subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        imageUrl = intent.getStringExtra(EXTRA_IMAGE_URL);
        channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME);
        String body = intent.getStringExtra(EXTRA_BODY);
        Context app = getApplicationContext();
        Bitmap cached = BkNotifications.cachedArt(imageUrl);
        Notification notification = BkNotifications.alarmNotification(app, kind, title, body, subtitle, channelName, imageUrl, cached);
        try {
            int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE : 0;
            ServiceCompat.startForeground(this, notificationId, notification, type);
        } catch (Exception e) {
            // ForegroundServiceStartNotAllowedException y compañía: aviso único, como antes
            Log.w(TAG, "sin foreground service para la alarma: aviso único", e);
            BkNotifications.postEnd(app, notificationId, title, body, subtitle, channelName, imageUrl, null);
            vibrateOnce();
            stopSelf();
            return START_NOT_STICKY;
        }
        startVibration();
        handler.removeCallbacks(timeout);
        handler.postDelayed(timeout, ALARM_MAX_MS);
        if (cached == null) {
            // la foto llega después: se actualiza la misma notificación de primer plano
            BkNotifications.loadArt(app, imageUrl, art -> {
                if (art == null || instance != this) return;
                BkNotifications.notifyRaw(app, notificationId,
                        BkNotifications.alarmNotification(app, kind, title, body, subtitle, channelName, imageUrl, art));
            });
        }
        return START_NOT_STICKY;
    }

    /** @param timedOut nadie dio al OK en el tope: callar y dejar el aviso silencioso */
    private void acknowledge(boolean timedOut) {
        Context app = getApplicationContext();
        String ackedKind = kind;
        finish(!timedOut);
        if (timedOut) {
            BkNotifications.postEnd(app, notificationId, title, "", subtitle, channelName, imageUrl, null);
        }
        // el reloj también calla: un stopped "cancelled" es lo que su StopPolicy entiende como OK
        if (ackedKind != null) BkWear.publishTimer(app, ackedKind, "stopped", 0L, 0L, "", "cancelled");
    }

    @Override
    public void onTimeout(int startId) {
        // API 34+: el sistema avisa antes de matar un shortService que se pasa
        acknowledge(true);
    }

    private void finish(boolean removeNotification) {
        handler.removeCallbacks(timeout);
        stopVibration();
        ServiceCompat.stopForeground(this, removeNotification
                ? ServiceCompat.STOP_FOREGROUND_REMOVE : ServiceCompat.STOP_FOREGROUND_DETACH);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(timeout);
        stopVibration();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    // ---------- vibración ----------

    private Vibrator vibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager == null ? null : manager.getDefaultVibrator();
        }
        return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    private void startVibration() {
        Vibrator vibrator = vibrator();
        if (vibrator == null) return;
        VibrationEffect effect = VibrationEffect.createWaveform(PATTERN, 0);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // como alarma: no la apaga el perfil de notificaciones silenciadas
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
        } else {
            vibrator.vibrate(effect);
        }
    }

    private void vibrateOnce() {
        Vibrator vibrator = vibrator();
        if (vibrator != null) vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 300, 150, 300, 150, 500}, -1));
    }

    private void stopVibration() {
        Vibrator vibrator = vibrator();
        if (vibrator != null) vibrator.cancel();
    }
}
