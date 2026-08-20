package dev.zurdi.berserk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.media.ThumbnailUtils;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.TextUtils;
import android.util.Log;
import android.util.LruCache;
import android.view.View;
import android.webkit.CookieManager;
import android.widget.RemoteViews;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * v0.30.0 (zurdi: "la notificación y el timer en la barra del móvil molaría
 * que fuese más bonita, con una imagen del ejercicio, como Spotify").
 *
 * Tarjeta a medida (DecoratedCustomViewStyle + RemoteViews): imagen del
 * ejercicio redondeada, título y ejercicio, y el CRONÓMETRO DEL SISTEMA
 * grande — un Chronometer dentro de la RemoteViews lo pinta Android, así
 * que sigue corriendo con la app muerta, igual que setUsesChronometer. El
 * estilo "media" de verdad (Spotify) exige una MediaSession y pondría un
 * reproductor falso en los controles multimedia: no es lo que somos.
 *
 * La imagen se baja con la cookie del WebView (los endpoints de media
 * exigen sesión) en un hilo aparte: la tarjeta sale al instante con la runa
 * y se re-publica con la foto al llegar — solo si el temporizador sigue
 * siendo el mismo (una carga tardía no debe resucitar una notificación que
 * ya se canceló).
 */
final class BkNotifications {

    static final String TAG = "BkWear";
    /** mismos ids de canal que las versiones anteriores: conservan los ajustes del usuario */
    static final String CHANNEL_TIMERS = "berserk-ongoing";
    static final String CHANNEL_ALERTS = "berserk-alerts";

    private static final int ART_PX = 192;
    /** Notification.EXTRA_REQUEST_PROMOTED_ONGOING (Android 16) */
    private static final String EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing";
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final LruCache<String, Bitmap> ART = new LruCache<>(6);
    /** id → whenMs de la última publicación viva; una carga de imagen tardía solo re-publica si coincide */
    private static final Map<Integer, Long> LIVE = new ConcurrentHashMap<>();

    private BkNotifications() {}

    interface ArtCallback {
        void onArt(Bitmap art);
    }

    /** Cronómetro (hacia arriba) o cuenta atrás ongoing. */
    static void postTimer(Context ctx, int id, String kindTitle, String exercise, long whenMs,
                          boolean countDown, String channelName, String imageUrl, String style) {
        Context app = ctx.getApplicationContext();
        ensureTimersChannel(app, channelName);
        // v0.33.0: el ejercicio es el titular y el tipo va debajo — antes se
        // repetía ("Cardio · Elíptica" / "Elíptica")
        final String title = TextUtils.isEmpty(exercise) ? kindTitle : exercise;
        final String subtitle = TextUtils.isEmpty(exercise) ? "" : kindTitle;
        final boolean promote = !"card".equals(style);
        LIVE.put(id, whenMs);
        Log.i(TAG, "timer " + id + " → " + title + " (" + (promote ? "live" : "card") + ")");
        Bitmap cached = imageUrl == null || imageUrl.isEmpty() ? null : ART.get(imageUrl);
        notify(app, id, build(app, CHANNEL_TIMERS, title, subtitle, whenMs, true, countDown, true, promote, cached));
        if (cached == null && imageUrl != null && !imageUrl.isEmpty()) {
            loadArt(app, imageUrl, art -> {
                Long current = LIVE.get(id);
                if (art == null || current == null || current != whenMs) return;
                notify(app, id, build(app, CHANNEL_TIMERS, title, subtitle, whenMs, true, countDown, true, promote, art));
            });
        }
    }

    /** Fin de cuenta atrás (suena): misma tarjeta sin cronómetro. */
    static void postEnd(Context ctx, int id, String title, String body, String subtitle,
                        String channelName, String imageUrl, Runnable done) {
        Context app = ctx.getApplicationContext();
        ensureAlertsChannel(app, channelName);
        String second = TextUtils.isEmpty(subtitle) ? body : subtitle;
        loadArt(app, imageUrl, art -> {
            try {
                notify(app, id, build(app, CHANNEL_ALERTS, title, second, System.currentTimeMillis(), false, false, false, false, art));
            } finally {
                if (done != null) done.run();
            }
        });
    }

    static void cancel(Context ctx, int id) {
        LIVE.remove(id);
        Log.i(TAG, "cancel " + id);
        manager(ctx).cancel(id);
    }

    // ---------- construcción ----------

    private static Notification build(Context ctx, String channelId, String title, String subtitle, long whenMs,
                                      boolean chronometer, boolean countDown, boolean ongoing, boolean promote, Bitmap art) {
        if (promote && ongoing && chronometer && Build.VERSION.SDK_INT >= 36
                && manager(ctx).canPostPromotedNotifications()) {
            return buildPromoted(ctx, channelId, title, subtitle, whenMs, countDown, art);
        }
        RemoteViews small = views(ctx, R.layout.bk_notif_timer, title, subtitle, whenMs, chronometer, countDown, art);
        RemoteViews big = views(ctx, R.layout.bk_notif_timer_big, title, subtitle, whenMs, chronometer, countDown, art);
        Notification.Builder builder = new Notification.Builder(ctx, channelId)
                .setSmallIcon(smallIcon(ctx))
                .setColor(ctx.getColor(R.color.bk_aurora))
                // título/texto estándar: accesibilidad y superficies que no pintan custom views
                .setContentTitle(title)
                .setContentText(subtitle == null ? "" : subtitle)
                .setStyle(new Notification.DecoratedCustomViewStyle())
                .setCustomContentView(small)
                .setCustomBigContentView(big)
                .setContentIntent(launchIntent(ctx))
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setShowWhen(true)
                .setWhen(whenMs);
        if (chronometer) {
            // la pantalla de bloqueo compacta y el reloj usan el cronómetro estándar
            builder.setUsesChronometer(true).setChronometerCountDown(countDown);
        }
        if (art != null) builder.setLargeIcon(art);
        if (ongoing) {
            builder.setOngoing(true).setOnlyAlertOnce(true);
        } else {
            builder.setAutoCancel(true);
        }
        return builder.build();
    }

    /**
     * v0.31.0 (zurdi: "la migración para el Now Bar de Samsung"): Live Update
     * de Android 16 — chip en la barra de estado con el cronómetro, tarjeta en
     * la pantalla de bloqueo y, en One UI 8, la Now Bar. La plataforma PROHÍBE
     * las vistas personalizadas en las promovidas, así que en Android 16+ la
     * tarjeta es estándar (imagen grande + cronómetro); la RemoteViews de
     * v0.30.0 queda para Android ≤ 15. Sin setShortCriticalText a propósito:
     * con él, el chip lo mostraría en vez del cronómetro.
     */
    private static Notification buildPromoted(Context ctx, String channelId, String title, String subtitle,
                                              long whenMs, boolean countDown, Bitmap art) {
        Notification.Builder builder = new Notification.Builder(ctx, channelId)
                .setSmallIcon(smallIcon(ctx))
                .setColor(ctx.getColor(R.color.bk_aurora))
                .setContentTitle(title)
                .setContentText(subtitle == null ? "" : subtitle)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .setWhen(whenMs)
                .setUsesChronometer(true)
                .setChronometerCountDown(countDown)
                .setContentIntent(launchIntent(ctx))
                .setVisibility(Notification.VISIBILITY_PUBLIC);
        // la petición de promoción: la doc de Live Updates admite el extra
        // EXTRA_REQUEST_PROMOTED_ONGOING como equivalente del setter (que el
        // framework de API 36 no expone en Notification.Builder)
        Bundle extras = new Bundle();
        extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true);
        builder.addExtras(extras);
        if (art != null) builder.setLargeIcon(art);
        return builder.build();
    }

    private static RemoteViews views(Context ctx, int layout, String title, String subtitle, long whenMs,
                                     boolean chronometer, boolean countDown, Bitmap art) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), layout);
        views.setTextViewText(R.id.bk_title, title == null ? "" : title);
        views.setTextViewText(R.id.bk_subtitle, subtitle == null ? "" : subtitle);
        views.setViewVisibility(R.id.bk_subtitle, TextUtils.isEmpty(subtitle) ? View.GONE : View.VISIBLE);
        if (chronometer) {
            // Chronometer trabaja en elapsedRealtime, no en epoch
            long base = SystemClock.elapsedRealtime() + (whenMs - System.currentTimeMillis());
            views.setChronometerCountDown(R.id.bk_chrono, countDown);
            views.setChronometer(R.id.bk_chrono, base, null, true);
            views.setViewVisibility(R.id.bk_chrono, View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.bk_chrono, View.GONE);
        }
        if (art != null) {
            views.setImageViewBitmap(R.id.bk_art, art);
        } else {
            views.setImageViewResource(R.id.bk_art, R.drawable.bk_notif_placeholder);
        }
        return views;
    }

    private static PendingIntent launchIntent(Context ctx) {
        Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (intent == null) return null;
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static int smallIcon(Context ctx) {
        int res = ctx.getResources().getIdentifier("ic_stat_berserk", "drawable", ctx.getPackageName());
        return res != 0 ? res : ctx.getApplicationInfo().icon;
    }

    private static NotificationManager manager(Context ctx) {
        return (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private static void notify(Context ctx, int id, Notification notification) {
        try {
            manager(ctx).notify(id, notification);
        } catch (Exception e) {
            Log.w(TAG, "notify " + id, e);
        }
    }

    static void ensureTimersChannel(Context ctx, String name) {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_TIMERS, name == null ? "berserk" : name, NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        manager(ctx).createNotificationChannel(channel);
    }

    static void ensureAlertsChannel(Context ctx, String name) {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ALERTS, name == null ? "berserk" : name, NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        manager(ctx).createNotificationChannel(channel);
    }

    // ---------- imagen ----------

    static void loadArt(Context ctx, String url, ArtCallback callback) {
        if (url == null || url.isEmpty()) {
            callback.onArt(null);
            return;
        }
        Bitmap cached = ART.get(url);
        if (cached != null) {
            callback.onArt(cached);
            return;
        }
        IO.execute(() -> {
            Bitmap art = fetch(url);
            if (art != null) ART.put(url, art);
            MAIN.post(() -> callback.onArt(art));
        });
    }

    private static Bitmap fetch(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(4000);
            // los endpoints de media piden la sesión: la cookie es la del WebView
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) connection.setRequestProperty("Cookie", cookie);
            if (connection.getResponseCode() != 200) return null;
            byte[] bytes = readAll(connection.getInputStream());
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sampleSize(bounds, ART_PX);
            Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            return decoded == null ? null : rounded(decoded, ART_PX, ART_PX * 0.2f);
        } catch (Exception e) {
            Log.w(TAG, "imagen de la notificación no disponible: " + e.getMessage());
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[16 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        return out.toByteArray();
    }

    private static int sampleSize(BitmapFactory.Options bounds, int target) {
        int size = 1;
        while (bounds.outWidth / (size * 2) >= target && bounds.outHeight / (size * 2) >= target) size *= 2;
        return size;
    }

    private static Bitmap rounded(Bitmap source, int sizePx, float radiusPx) {
        Bitmap square = ThumbnailUtils.extractThumbnail(source, sizePx, sizePx);
        Bitmap out = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(new RectF(0, 0, sizePx, sizePx), radiusPx, radiusPx, paint);
        return out;
    }
}
