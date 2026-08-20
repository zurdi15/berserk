package dev.zurdi.berserk.wear.notify

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import dev.zurdi.berserk.wear.alarm.AlarmService
import dev.zurdi.berserk.wear.R
import dev.zurdi.berserk.wear.core.ActiveTimer
import dev.zurdi.berserk.wear.core.ClockSync
import dev.zurdi.berserk.wear.core.TimerBoard
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.ui.MainActivity

/**
 * Todo lo que el sistema pinta SIN que la app viva:
 *  - una notificación ongoing por temporizador con cronómetro DEL SISTEMA
 *    (setUsesChronometer / setChronometerCountDown: el mismo truco que la
 *    shell del móvil en BkOngoingPlugin), y
 *  - para el temporizador principal (TimerBoard.primary), una Ongoing
 *    Activity con Status.TimerPart / StopwatchPart: el indicador de la esfera
 *    y Recientes con el tiempo corriendo.
 *
 * No hay foreground service a propósito: lo visible lo renderiza Wear OS y
 * el aviso a cero lo dispara una alarma (TimerAlarms), así que no hay proceso
 * que mantener vivo ni restricciones de arranque en segundo plano que
 * esquivar (la doc oficial no exime al WearableListenerService).
 */
class TimerNotifier(context: Context) {
    private val ctx = context.applicationContext
    private val manager: NotificationManager
        get() = ctx.getSystemService(NotificationManager::class.java)

    fun render(board: TimerBoard, nowEpochMs: Long) {
        ensureChannels()
        val primary = board.primary()
        for (kind in TimerKind.entries) {
            val timer = board.timers[kind]
            if (timer == null || timer.isFinished) {
                manager.cancel(kind.notificationId)
                continue
            }
            manager.notify(kind.notificationId, ongoingNotification(timer, withOngoingActivity = primary?.kind == kind, nowEpochMs = nowEpochMs))
        }
    }

    fun cancelOngoing(kind: TimerKind) {
        manager.cancel(kind.notificationId)
    }

    /**
     * Notificación de fin. Alarmando (v0.29.0): ongoing, con la acción OK y
     * el descarte como OK — es la notificación del AlarmService que vibra
     * hasta que el usuario se da por enterado. Sin alarma: silenciosa, se
     * descarta sola.
     */
    fun doneNotification(timer: ActiveTimer, alarming: Boolean): Notification {
        ensureChannels()
        // v0.35.0: sin "¡Tiempo!" — el nombre del temporizador basta
        val builder = NotificationCompat.Builder(ctx, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_berserk)
            .setContentTitle(titleOf(timer))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(contentIntent())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        if (alarming) {
            val ack = AlarmService.ackIntent(ctx, timer.kind)
            // v0.30.0 (zurdi: "que abriese la app directamente"): full-screen
            // intent, el mecanismo de las apps de alarma — con la pantalla
            // apagada o en reposo, el sistema lanza la Activity (AlarmScreen
            // con su OK) en vez de la notificación con opciones
            val open = alarmActivityIntent(timer.kind)
            builder
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVibrate(VIBRATION)
                .setContentIntent(open)
                .setFullScreenIntent(open, true)
                .addAction(R.drawable.ic_stat_berserk, ctx.getString(R.string.ok), ack)
                .setDeleteIntent(ack)
        } else {
            builder
                .setSilent(true)
                .setAutoCancel(true)
                .setTimeoutAfter(DONE_TIMEOUT_MS)
        }
        return builder.build()
    }

    fun showDone(timer: ActiveTimer, alarming: Boolean) {
        manager.cancel(timer.kind.notificationId)
        manager.notify(timer.kind.doneNotificationId, doneNotification(timer, alarming))
    }

    fun cancelDone(kind: TimerKind) {
        manager.cancel(kind.doneNotificationId)
    }

    /** La notificación ongoing de un temporizador. */
    fun ongoingNotification(timer: ActiveTimer, withOngoingActivity: Boolean, nowEpochMs: Long): Notification {
        val kind = timer.kind
        val title = titleOf(timer)
        val builder = NotificationCompat.Builder(ctx, CHANNEL_TIMERS)
            .setSmallIcon(R.drawable.ic_stat_berserk)
            // v0.31.1: el color de la app, que la Now Bar de One UI 8 Watch pinta
            // en su barra (el texto del tiempo NO depende de nada de esto: es el
            // modo "icono con texto" POR APP de la propia Now Bar — v0.31.2)
            .setColor(ctx.getColor(R.color.aurora))
            .setContentTitle(title)
            .setContentText(
                ctx.getString(if (kind.countsDown) R.string.notif_countdown_text else R.string.notif_stopwatch_text),
            )
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(true)
            .setWhen(timer.targetEpochMs)
            .setUsesChronometer(true)
            .setChronometerCountDown(kind.countsDown)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentIntent())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // v0.31.0 (zurdi: "la migración para el Now Bar"): Live Update —
            // en Wear OS 7 (One UI 9 Watch) el chip de la Now Bar pinta el
            // cronómetro del setWhen; en Wear OS 6 NotificationCompat lo ignora.
            // La Ongoing Activity se mantiene: la doc de Wear OS 7 admite las dos.
            .setRequestPromotedOngoing(true)

        if (withOngoingActivity) {
            // Status.TimerPart/StopwatchPart van en base elapsedRealtime, no epoch
            val zero = ClockSync.toElapsedRealtime(timer.targetEpochMs, nowEpochMs, SystemClock.elapsedRealtime())
            val timePart = if (kind.countsDown) {
                if (timer.spec.totalMs > 0L) Status.TimerPart(zero, -1L, timer.spec.totalMs) else Status.TimerPart(zero)
            } else {
                Status.StopwatchPart(zero)
            }
            // v0.31.1: título + tiempo en el estado (las superficies que pintan
            // texto —Recientes, la Now Bar de Samsung— tienen qué mostrar)
            val status = Status.Builder()
                .addTemplate("#title# #time#")
                .addPart("title", Status.TextPart(title))
                .addPart("time", timePart)
                .build()
            OngoingActivity.Builder(ctx, kind.notificationId, builder)
                .setStaticIcon(R.drawable.ic_stat_berserk)
                .setTouchIntent(contentIntent())
                .setTitle(title)
                // v0.31.1: los entrenos son una de las categorías que la Now Bar
                // de One UI 8 Watch trata como propias
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setStatus(status)
                .build()
                .apply(ctx)
        }
        return builder.build()
    }

    private fun titleOf(timer: ActiveTimer): String = timer.spec.title.ifEmpty {
        ctx.getString(
            when (timer.kind) {
                TimerKind.REST -> R.string.kind_rest
                TimerKind.CARDIO -> R.string.kind_cardio
                TimerKind.WORKOUT -> R.string.kind_workout
            },
        )
    }

    private fun alarmActivityIntent(kind: TimerKind): PendingIntent {
        val intent = Intent(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_FROM_ALARM, true)
        return PendingIntent.getActivity(
            ctx, 5001 + kind.ordinal, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun contentIntent(): PendingIntent {
        val intent = Intent(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(
            ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun ensureChannels() {
        val timers = NotificationChannel(
            CHANNEL_TIMERS, ctx.getString(R.string.channel_timers), NotificationManager.IMPORTANCE_LOW,
        ).apply {
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        val alerts = NotificationChannel(
            CHANNEL_ALERTS, ctx.getString(R.string.channel_alerts), NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            enableVibration(true)
            vibrationPattern = VIBRATION
        }
        manager.createNotificationChannel(timers)
        manager.createNotificationChannel(alerts)
    }

    companion object {
        const val CHANNEL_TIMERS = "berserk-wear-timers"
        const val CHANNEL_ALERTS = "berserk-wear-alerts"
        private const val DONE_TIMEOUT_MS = 20_000L
        private val VIBRATION = longArrayOf(0, 300, 150, 300, 150, 500)
    }
}
