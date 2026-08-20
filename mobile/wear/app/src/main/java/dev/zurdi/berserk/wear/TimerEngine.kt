package dev.zurdi.berserk.wear

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import dev.zurdi.berserk.wear.alarm.TimerAlarms
import dev.zurdi.berserk.wear.core.ActiveTimer
import dev.zurdi.berserk.wear.core.ClockSync
import dev.zurdi.berserk.wear.core.TimerBoard
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.core.TimerSpec
import dev.zurdi.berserk.wear.notify.Haptics
import dev.zurdi.berserk.wear.notify.TimerNotifier
import dev.zurdi.berserk.wear.state.TimerRepository
import dev.zurdi.berserk.wear.sync.DataMapFields
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Orquestador: la única puerta por la que entra estado (Data Layer, alarma,
 * UI) y sale a sus tres salidas (repositorio, notificaciones/Ongoing
 * Activity, alarmas). Idempotente a propósito — el mismo DataItem puede
 * llegar dos veces (reconexión + restore) sin efectos dobles.
 */
class TimerEngine private constructor(context: Context) {
    private val ctx = context.applicationContext
    private val repository = TimerRepository.get(ctx)
    private val notifier = TimerNotifier(ctx)
    private val alarms = TimerAlarms(ctx)

    val board: StateFlow<TimerBoard> get() = repository.board

    /** Lo que dice el móvil. */
    @Synchronized
    fun apply(spec: TimerSpec, nowEpochMs: Long = System.currentTimeMillis()) {
        if (ClockSync.isSuspicious(spec.sentAtEpochMs, nowEpochMs)) {
            Log.w(TAG, "${spec.kind.wireName}: sentAt difiere ${ClockSync.skewMs(spec.sentAtEpochMs, nowEpochMs)} ms de ahora (entrega tardía o reloj desajustado)")
        }
        if (!spec.running) {
            stop(spec.kind, nowEpochMs)
            return
        }
        val timer = ActiveTimer(spec, receivedAtEpochMs = nowEpochMs)
        if (timer.kind.countsDown && timer.remainingMs(nowEpochMs) < -STALE_AFTER_MS) {
            // DataItem viejo (reconexión, arranque, app recién instalada): ya
            // venció hace rato — ni notificación ni vibración a destiempo
            Log.i(TAG, "${spec.kind.wireName} ignorado: venció hace ${-timer.remainingMs(nowEpochMs)} ms")
            stop(spec.kind, nowEpochMs)
            return
        }
        val board = repository.update { it.with(timer).pruned(nowEpochMs) }
        if (timer.kind.countsDown) {
            if (timer.isDue(nowEpochMs)) {
                // llegó justo en el filo: darlo por terminado ya
                onCountdownDue(timer.kind, nowEpochMs)
                return
            }
            alarms.schedule(timer)
        }
        notifier.render(board, nowEpochMs)
    }

    /** Fuera ese temporizador (stopped del móvil, DataItem borrado, cancelación local). */
    @Synchronized
    fun stop(kind: TimerKind, nowEpochMs: Long = System.currentTimeMillis()) {
        alarms.cancel(kind)
        val board = repository.update { it.without(kind).pruned(nowEpochMs) }
        notifier.cancelOngoing(kind)
        notifier.render(board, nowEpochMs)
    }

    /**
     * Cancelación desde el propio reloj: para aquí ya (optimista) — pedirle
     * al móvil que cancele es cosa de PhoneLink.requestCancel. Si el móvil no
     * estaba al alcance, su DataItem seguirá diciendo running y lo resucitará
     * al reconectar mientras no haya vencido: converge a la verdad del móvil.
     */
    fun cancelLocally(kind: TimerKind) = stop(kind)

    /** La cuenta atrás llegó a cero (alarma, o DataItem justo en el filo). */
    @Synchronized
    fun onCountdownDue(kind: TimerKind, nowEpochMs: Long = System.currentTimeMillis()) {
        val current = repository.board.value.timers[kind] ?: return
        if (current.isFinished) return
        val finished = current.copy(finishedAtEpochMs = nowEpochMs)
        val board = repository.update { it.with(finished).pruned(nowEpochMs) }
        alarms.cancel(kind)
        notifier.showDone(finished)
        Haptics.timeUp(ctx)
        notifier.render(board, nowEpochMs)
    }

    /** Tras reinicio/actualización: re-pintar y re-programar desde lo persistido, y luego la verdad del móvil. */
    suspend fun rehydrate() {
        val now = System.currentTimeMillis()
        val board = repository.board.value
        board.live.forEach { alarms.schedule(it) }
        notifier.render(board, now)
        restoreFromDataLayer()
    }

    /** Lee todos los DataItems de temporizadores y los aplica. Devuelve cuántos se aplicaron (0 si la Data Layer no responde). */
    suspend fun restoreFromDataLayer(): Int = withContext(Dispatchers.IO) {
        val uri = Uri.parse("wear://*${TimerKind.PATH_PREFIX}")
        val buffer = try {
            Wearable.getDataClient(ctx).getDataItems(uri, DataClient.FILTER_PREFIX).await()
        } catch (e: Exception) {
            Log.w(TAG, "Data Layer no disponible", e)
            return@withContext 0
        }
        try {
            var applied = 0
            for (item in buffer) {
                val kind = TimerKind.fromPath(item.uri.path) ?: continue
                when (val decoded = TimerSpec.decode(DataMapFields(DataMapItem.fromDataItem(item).dataMap), kind)) {
                    is TimerSpec.Decoded.Ok -> {
                        apply(decoded.spec)
                        applied++
                    }
                    is TimerSpec.Decoded.Invalid -> Log.w(TAG, "DataItem ${item.uri} inválido: ${decoded.reason}")
                }
            }
            applied
        } finally {
            buffer.release()
        }
    }

    companion object {
        /** una cuenta atrás vencida hace más de esto al llegar no merece ni aviso */
        const val STALE_AFTER_MS = 15_000L
        private const val TAG = "BkWear"

        @Volatile
        private var instance: TimerEngine? = null

        fun get(context: Context): TimerEngine =
            instance ?: synchronized(this) { instance ?: TimerEngine(context).also { instance = it } }
    }
}
