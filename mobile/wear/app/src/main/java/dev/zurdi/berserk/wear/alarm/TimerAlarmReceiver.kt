package dev.zurdi.berserk.wear.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import dev.zurdi.berserk.wear.TimerEngine
import dev.zurdi.berserk.wear.core.TimerKind

/** Fin de una cuenta atrás: vibración + "¡Tiempo!" (ver TimerEngine.onCountdownDue). */
class TimerAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TimerAlarms.ACTION_TIMER_END) return
        val kind = TimerKind.fromWire(intent.getStringExtra(TimerAlarms.EXTRA_KIND)) ?: return
        try {
            TimerEngine.get(context).onCountdownDue(kind)
        } catch (e: Exception) {
            // un receiver que lanza tumba el proceso: mejor un aviso perdido que la app muerta
            Log.e(TAG, "fin de ${kind.wireName}", e)
        }
    }

    private companion object {
        const val TAG = "BkWear"
    }
}
