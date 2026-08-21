package dev.zurdi.berserk.wear.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import dev.zurdi.berserk.wear.core.ActiveTimer
import dev.zurdi.berserk.wear.core.PhoneClock
import dev.zurdi.berserk.wear.core.TimerKind

/**
 * El aviso a 0:00 NO depende de que el proceso viva: una alarma de
 * AlarmManager despierta TimerAlarmReceiver en el instante exacto. Exacta si
 * el sistema lo permite (USE_EXACT_ALARM, ver manifest); si no, inexacta
 * antes que nada — y nunca una excepción que tire la app.
 */
class TimerAlarms(context: Context) {
    private val ctx = context.applicationContext
    private val alarmManager: AlarmManager
        get() = ctx.getSystemService(AlarmManager::class.java)

    fun schedule(timer: ActiveTimer) {
        if (!timer.kind.countsDown) return
        val operation = operation(timer.kind)
        // v0.37.1: AlarmManager va en hora de pared del RELOJ; el fin llega en la del móvil
        val at = PhoneClock.toWatchEpoch(timer.targetEpochMs)
        val exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
        try {
            if (exactAllowed) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
            } else {
                Log.w(TAG, "sin permiso de alarmas exactas: el fin de ${timer.kind.wireName} puede llegar tarde")
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
            }
        } catch (e: SecurityException) {
            // canScheduleExactAlarms mintió (o el permiso cambió entre medias)
            Log.w(TAG, "alarma exacta rechazada, degradando a inexacta", e)
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
        }
    }

    fun cancel(kind: TimerKind) {
        alarmManager.cancel(operation(kind))
    }

    private fun operation(kind: TimerKind): PendingIntent {
        val intent = Intent(ctx, TimerAlarmReceiver::class.java)
            .setAction(ACTION_TIMER_END)
            .putExtra(EXTRA_KIND, kind.wireName)
        return PendingIntent.getBroadcast(
            ctx,
            REQUEST_BASE + kind.ordinal,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        const val ACTION_TIMER_END = "dev.zurdi.berserk.wear.TIMER_END"
        const val EXTRA_KIND = "kind"
        private const val REQUEST_BASE = 3001
        private const val TAG = "BkWear"
    }
}
