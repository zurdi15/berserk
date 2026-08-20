package dev.zurdi.berserk.wear.sync

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import dev.zurdi.berserk.wear.core.TimerKind
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * El móvil, visto desde el reloj: se localiza por la capacidad que anuncia la
 * shell (berserk_phone, mobile/android res/values/wear.xml) y se le mandan
 * órdenes por MessageClient. El estado de los temporizadores NO va por aquí
 * (eso es la Data Layer → TimerListenerService).
 */
class PhoneLink(context: Context) {
    private val ctx = context.applicationContext
    private val capabilityClient by lazy { Wearable.getCapabilityClient(ctx) }
    private val messageClient by lazy { Wearable.getMessageClient(ctx) }

    suspend fun phoneNode(): Node? = runCatching {
        val nodes = capabilityClient.getCapability(CAPABILITY_PHONE, CapabilityClient.FILTER_REACHABLE).await().nodes
        nodes.firstOrNull { it.isNearby } ?: nodes.firstOrNull()
    }.getOrNull()

    /** Pide al móvil que cancele esa cuenta atrás. false = no había móvil accesible o el mensaje no se encoló. */
    suspend fun requestCancel(kind: TimerKind): Boolean {
        val node = phoneNode() ?: return false
        return runCatching {
            messageClient.sendMessage(node.id, PATH_CMD_CANCEL, kind.wireName.toByteArray(Charsets.UTF_8)).await()
            true
        }.getOrElse {
            Log.w(TAG, "cancelación de ${kind.wireName} no entregada", it)
            false
        }
    }

    /** ¿Hay un móvil con berserk al alcance? Emite el estado inicial y cada cambio. */
    fun phoneReachable(): Flow<Boolean> = callbackFlow {
        val listener = CapabilityClient.OnCapabilityChangedListener { info -> trySend(info.nodes.isNotEmpty()) }
        capabilityClient.addListener(listener, CAPABILITY_PHONE)
        trySend(phoneNode() != null)
        awaitClose { capabilityClient.removeListener(listener, CAPABILITY_PHONE) }
    }

    companion object {
        const val CAPABILITY_PHONE = "berserk_phone"
        const val PATH_CMD_CANCEL = "/berserk/cmd/cancel"
        const val PATH_CMD_SYNC = "/berserk/cmd/sync"
        private const val TAG = "BkWear"
    }
}
