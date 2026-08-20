package dev.zurdi.berserk.wear.alarm

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import dev.zurdi.berserk.wear.TimerEngine
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.notify.Haptics
import dev.zurdi.berserk.wear.notify.TimerNotifier

/**
 * v0.29.0 — la alarma que no para hasta el OK. Servicio en primer plano de
 * tipo shortService (tope del sistema 3 min; el nuestro 60 s) arrancado
 * desde la alarma exacta: ese arranque está en la lista oficial de
 * exenciones a la restricción de foreground services en segundo plano. Si
 * aun así el sistema lo niega, cae al aviso único de siempre y se da por
 * enterado solo. El OK llega por tres caminos: el botón de la pantalla
 * (TimerEngine.acknowledge → stopIfRunning), la acción de la notificación y
 * descartarla (ACTION_ACK).
 */
class AlarmService : Service() {
    private var kind: TimerKind? = null
    private val handler = Handler(Looper.getMainLooper())
    private val timeout = Runnable {
        // tope: nadie dio al OK — darse por enterado y callar (el aviso silencioso se queda)
        kind?.let { TimerEngine.get(this).acknowledge(it) }
        finish()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val requested = TimerKind.fromWire(intent?.getStringExtra(EXTRA_KIND))
        when (intent?.action) {
            ACTION_START -> start(requested)
            ACTION_ACK -> {
                (requested ?: kind)?.let { TimerEngine.get(this).acknowledge(it) }
                finish()
            }
            else -> stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun start(requested: TimerKind?) {
        val engine = TimerEngine.get(this)
        val timer = requested?.let { engine.board.value.timers[it] }
        if (requested == null || timer == null || !timer.isAlarming) {
            stopSelf()
            return
        }
        kind = requested
        val notifier = TimerNotifier(this)
        val notification = notifier.doneNotification(timer, alarming = true)
        try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
            } else {
                0
            }
            ServiceCompat.startForeground(this, requested.doneNotificationId, notification, type)
        } catch (e: Exception) {
            // ForegroundServiceStartNotAllowedException y compañía: aviso único y fuera
            Log.w(TAG, "sin foreground service para la alarma: aviso único", e)
            notifier.showDone(timer, alarming = false)
            Haptics.timeUp(this)
            engine.acknowledge(requested)
            stopSelf()
            return
        }
        Haptics.startAlarm(this)
        handler.removeCallbacks(timeout)
        handler.postDelayed(timeout, ALARM_MAX_MS)
    }

    /** API 34+: el sistema avisa antes de matar un shortService que se pasa de tiempo */
    override fun onTimeout(startId: Int) {
        kind?.let { TimerEngine.get(this).acknowledge(it) }
        finish()
    }

    fun finish() {
        handler.removeCallbacks(timeout)
        Haptics.stopAlarm(this)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacks(timeout)
        Haptics.stopAlarm(this)
        if (instance === this) instance = null
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "dev.zurdi.berserk.wear.ALARM_START"
        const val ACTION_ACK = "dev.zurdi.berserk.wear.ALARM_ACK"
        const val EXTRA_KIND = "kind"
        const val ALARM_MAX_MS = 60_000L
        private const val TAG = "BkWear"

        @Volatile
        private var instance: AlarmService? = null

        /** true si se pudo pedir el arranque (el fallback a aviso único vive dentro del servicio) */
        fun start(context: Context, kind: TimerKind): Boolean = try {
            val intent = Intent(context, AlarmService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_KIND, kind.wireName)
            ContextCompat.startForegroundService(context, intent)
            true
        } catch (e: Exception) {
            Log.w(TAG, "no se pudo arrancar AlarmService", e)
            false
        }

        fun stopIfRunning() {
            instance?.finish()
        }

        fun ackIntent(context: Context, kind: TimerKind): PendingIntent {
            val intent = Intent(context, AlarmService::class.java)
                .setAction(ACTION_ACK)
                .putExtra(EXTRA_KIND, kind.wireName)
            return PendingIntent.getService(
                context, 4001 + kind.ordinal, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
    }
}
