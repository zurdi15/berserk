package dev.zurdi.berserk.wear.sync

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import dev.zurdi.berserk.wear.TimerEngine
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.core.TimerSpec
import kotlinx.coroutines.runBlocking

/**
 * Entrada de la Data Layer. Play services lo enlaza (y arranca el proceso si
 * hace falta) con cada cambio bajo /berserk/ (ver manifest): un DataItem por
 * temporizador con la verdad del móvil. Todo lo que hace es decodificar y
 * delegar en TimerEngine; los eventos solo valen durante el callback, así
 * que no se retiene nada.
 */
class TimerListenerService : WearableListenerService() {

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        val engine = TimerEngine.get(applicationContext)
        for (event in dataEvents) {
            val item = event.dataItem
            val kind = TimerKind.fromPath(item.uri.path) ?: continue
            when (event.type) {
                DataEvent.TYPE_DELETED -> engine.stop(kind)
                DataEvent.TYPE_CHANGED -> {
                    val fields = DataMapFields(DataMapItem.fromDataItem(item).dataMap)
                    when (val decoded = TimerSpec.decode(fields, kind)) {
                        is TimerSpec.Decoded.Ok -> engine.apply(decoded.spec)
                        is TimerSpec.Decoded.Invalid -> Log.w(TAG, "DataItem ${item.uri.path} inválido: ${decoded.reason}")
                    }
                }
            }
        }
    }

    override fun onMessageReceived(event: MessageEvent) {
        // reservado para órdenes del móvil; hoy solo "vuelve a leer la Data Layer"
        if (event.path == PhoneLink.PATH_CMD_SYNC) {
            runBlocking { TimerEngine.get(applicationContext).restoreFromDataLayer() }
        }
    }

    private companion object {
        const val TAG = "BkWear"
    }
}
