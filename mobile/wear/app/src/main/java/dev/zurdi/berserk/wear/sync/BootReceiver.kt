package dev.zurdi.berserk.wear.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import dev.zurdi.berserk.wear.TimerEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Reinicio o actualización de la app: las alarmas de fin se pierden y las
 * notificaciones también. Se re-pintan desde lo persistido y se vuelve a
 * leer la verdad del móvil (los DataItems sobreviven a todo eso).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                TimerEngine.get(context).rehydrate()
            } catch (e: Exception) {
                Log.w(TAG, "rehidratación tras ${intent.action}", e)
            } finally {
                pending.finish()
            }
        }
    }

    private companion object {
        const val TAG = "BkWear"
    }
}
