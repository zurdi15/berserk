package dev.zurdi.berserk.wear.notify

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import dev.zurdi.berserk.wear.TimerEngine

/**
 * v0.31.1 (zurdi, con el Watch 8 en la mano: "con el cronómetro preinstalado
 * se muestra una especie de Now Bar con el icono, un color de la app y el
 * propio timer; con berserk veo el icono pero no el timer"). Lo que Wear OS
 * garantiza a una Ongoing Activity de terceros es el indicador (icono); la
 * Now Bar de One UI 8 Watch con texto y color es una capa de Samsung sin API
 * pública. Una diferencia objetiva con las apps que sí la consiguen (Maps,
 * los entrenos) es que su notificación ongoing viene de un FOREGROUND
 * SERVICE. Este servicio no hace nada más que ADOPTAR la notificación que
 * TimerNotifier ya publicó (mismo id) para que conste como de primer plano.
 * Si el sistema niega el arranque desde segundo plano (la Data Layer no
 * está en la lista de exenciones), no pasa nada: la notificación normal
 * sigue ahí. Tipo specialUse: un temporizador espejo del móvil no encaja en
 * ningún tipo estándar.
 */
class TimerForegroundService : Service() {
    private var currentId: Int? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val board = TimerEngine.get(this).board.value
        val primary = board.primary()
        if (primary == null) {
            finish(removeNotification = true)
            return START_NOT_STICKY
        }
        val notification = TimerNotifier(this).ongoingNotification(primary, withOngoingActivity = true, nowEpochMs = System.currentTimeMillis())
        try {
            if (currentId != null && currentId != primary.kind.notificationId) {
                // cambia el temporizador principal: la notificación anterior ya no es de primer plano
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            }
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            } else {
                0
            }
            ServiceCompat.startForeground(this, primary.kind.notificationId, notification, type)
            currentId = primary.kind.notificationId
        } catch (e: Exception) {
            Log.i(TAG, "sin foreground service para el temporizador (la notificación normal sigue): ${e.message}")
            currentId = null
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun finish(removeNotification: Boolean) {
        ServiceCompat.stopForeground(
            this,
            if (removeNotification) ServiceCompat.STOP_FOREGROUND_REMOVE else ServiceCompat.STOP_FOREGROUND_DETACH,
        )
        currentId = null
        stopSelf()
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    companion object {
        private const val TAG = "BkWear"

        @Volatile
        private var instance: TimerForegroundService? = null

        /** Hay temporizador principal: que el servicio adopte (o actualice) su notificación. */
        fun sync(context: Context) {
            try {
                ContextCompat.startForegroundService(context, Intent(context, TimerForegroundService::class.java))
            } catch (e: Exception) {
                Log.i(TAG, "no se pudo pedir el foreground service del temporizador: ${e.message}")
            }
        }

        /** No queda nada vivo: fuera el servicio y su notificación. */
        fun stopIfRunning() {
            instance?.finish(removeNotification = true)
        }
    }
}
