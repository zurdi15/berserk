package dev.zurdi.berserk.wear.sync

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import dev.zurdi.berserk.wear.core.TimerKind
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
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

    /** v0.34.0: el OK del reloj calla también la alarma del móvil. */
    suspend fun requestAck(kind: TimerKind): Boolean {
        val node = phoneNode() ?: return false
        return runCatching {
            messageClient.sendMessage(node.id, PATH_CMD_ACK, kind.wireName.toByteArray(Charsets.UTF_8)).await()
            true
        }.getOrElse { false }
    }

    /**
     * v0.32.1 (zurdi: "no veo que la runa se apague cuando quito el Bluetooth
     * del móvil"): el Galaxy Watch, sin Bluetooth, llega al móvil por
     * Wi-Fi/Internet (la conexión remota de Galaxy Wearable) y la Data Layer
     * sigue funcionando por ahí — el móvil sigue "al alcance", pero no cerca.
     * Tres estados, y un sondeo de respaldo: el listener de capacidades no
     * siempre avisa de un cambio de alcance.
     */
    fun phonePresence(): Flow<PhonePresence> = callbackFlow {
        val listener = CapabilityClient.OnCapabilityChangedListener { info -> trySend(classify(info.nodes)) }
        capabilityClient.addListener(listener, CAPABILITY_PHONE)
        trySend(readPresence())
        val poller = launch {
            while (isActive) {
                delay(PRESENCE_POLL_MS)
                trySend(readPresence())
            }
        }
        awaitClose {
            poller.cancel()
            capabilityClient.removeListener(listener, CAPABILITY_PHONE)
        }
    }

    private suspend fun readPresence(): PhonePresence = classify(
        runCatching { capabilityClient.getCapability(CAPABILITY_PHONE, CapabilityClient.FILTER_REACHABLE).await().nodes }
            .getOrDefault(emptySet()),
    )

    private fun classify(nodes: Set<Node>): PhonePresence = when {
        nodes.any { it.isNearby } -> PhonePresence.NEARBY
        nodes.isNotEmpty() -> PhonePresence.REMOTE
        else -> PhonePresence.NONE
    }

    /** Cómo se ve el móvil desde el reloj. */
    enum class PhonePresence {
        /** conectado directamente (Bluetooth) */
        NEARBY,
        /** al alcance solo por Wi-Fi/Internet: la Data Layer funciona, con más latencia */
        REMOTE,
        /** ningún móvil con berserk al alcance */
        NONE,
    }

    companion object {
        const val CAPABILITY_PHONE = "berserk_phone"
        private const val PRESENCE_POLL_MS = 10_000L
        const val PATH_CMD_CANCEL = "/berserk/cmd/cancel"
        const val PATH_CMD_SYNC = "/berserk/cmd/sync"
        const val PATH_CMD_ACK = "/berserk/cmd/ack"
        private const val TAG = "BkWear"
    }
}
