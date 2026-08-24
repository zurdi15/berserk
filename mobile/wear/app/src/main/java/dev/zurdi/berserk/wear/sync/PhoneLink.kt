package dev.zurdi.berserk.wear.sync

import android.content.Context
import android.os.SystemClock
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
import java.nio.ByteBuffer

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

    /**
     * v0.37.1: ping de reloj (ver core/PhoneClock). Cuerpo = el monotónico del
     * reloj al enviar; el móvil lo devuelve junto a su epoch por PATH_CLOCK_PONG
     * y TimerListenerService cierra el cálculo. Fire-and-forget.
     */
    suspend fun pingClock(): Boolean {
        val node = phoneNode() ?: return false
        val payload = ByteBuffer.allocate(8).putLong(SystemClock.elapsedRealtime()).array()
        return runCatching {
            messageClient.sendMessage(node.id, PATH_CMD_CLOCK, payload).await()
            true
        }.getOrElse { false }
    }

    /** v0.34.0: el OK del reloj calla también la alarma del móvil (v0.38.0: solo la de ese tipo). */
    suspend fun requestAck(kind: TimerKind): Boolean {
        val node = phoneNode() ?: return false
        return runCatching {
            messageClient.sendMessage(node.id, PATH_CMD_ACK, kind.wireName.toByteArray(Charsets.UTF_8)).await()
            true
        }.getOrElse { false }
    }

    /**
     * v0.38.0 (zurdi: "añadir serie desde el reloj y poder finalizar
     * ejercicio"): órdenes sobre el ejercicio actual, con el weid que se tenía
     * en pantalla para que el móvil no actúe sobre otro si cambió entre medias.
     * La web es quien registra; si no está viva el móvil contesta por
     * PATH_CMD_UNDELIVERED (ver TimerListenerService). false = sin móvil al alcance.
     */
    suspend fun requestLogSet(weid: Long): Boolean = sendCommand(PATH_CMD_LOG_SET, weid.toString())

    suspend fun requestCompleteExercise(weid: Long): Boolean = sendCommand(PATH_CMD_COMPLETE_EXERCISE, weid.toString())

    private suspend fun sendCommand(path: String, body: String): Boolean {
        val node = phoneNode() ?: return false
        return runCatching {
            messageClient.sendMessage(node.id, path, body.toByteArray(Charsets.UTF_8)).await()
            true
        }.getOrElse {
            Log.w(TAG, "orden $path no entregada", it)
            false
        }
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
        const val PATH_CMD_CLOCK = "/berserk/cmd/clock"
        const val PATH_CLOCK_PONG = "/berserk/clock/pong"
        const val PATH_CMD_LOG_SET = "/berserk/cmd/logSet"
        const val PATH_CMD_COMPLETE_EXERCISE = "/berserk/cmd/completeExercise"
        const val PATH_CMD_UNDELIVERED = "/berserk/cmd/undelivered"
        private const val TAG = "BkWear"
    }
}
