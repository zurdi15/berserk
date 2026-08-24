package dev.zurdi.berserk.wear

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import dev.zurdi.berserk.wear.alarm.AlarmService
import dev.zurdi.berserk.wear.alarm.TimerAlarms
import dev.zurdi.berserk.wear.core.ActiveTimer
import dev.zurdi.berserk.wear.core.ClockSync
import dev.zurdi.berserk.wear.core.ExerciseSpec
import dev.zurdi.berserk.wear.core.PhoneClock
import dev.zurdi.berserk.wear.core.StopAction
import dev.zurdi.berserk.wear.core.StopPolicy
import dev.zurdi.berserk.wear.core.TimerBoard
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.core.TimerSpec
import dev.zurdi.berserk.wear.notify.Haptics
import dev.zurdi.berserk.wear.notify.TimerNotifier
import dev.zurdi.berserk.wear.state.ExerciseRepository
import dev.zurdi.berserk.wear.state.TimerRepository
import dev.zurdi.berserk.wear.sync.DataMapFields
import dev.zurdi.berserk.wear.sync.PhoneLink
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Orquestador: la única puerta por la que entra estado (Data Layer, alarma,
 * UI) y sale a sus salidas (repositorio, notificaciones/Ongoing Activity,
 * alarmas, servicio de alarma). Idempotente a propósito — el mismo DataItem
 * puede llegar dos veces (reconexión + restore) sin efectos dobles.
 */
class TimerEngine private constructor(context: Context) {
    private val ctx = context.applicationContext
    private val repository = TimerRepository.get(ctx)
    private val exerciseRepository = ExerciseRepository.get(ctx)
    private val notifier = TimerNotifier(ctx)
    private val alarms = TimerAlarms(ctx)

    val board: StateFlow<TimerBoard> get() = repository.board

    /** v0.38.0: el ejercicio actual tal cual llegó (ver TimerBoard.exerciseFor para cuándo enseñarlo) */
    val exercise: StateFlow<ExerciseSpec?> get() = exerciseRepository.exercise

    // v0.38.0: cuándo (hora del móvil) el móvil devolvió una orden sin web
    // viva que la ejecutara — la pantalla lo enseña unos segundos
    private val undeliveredAt = MutableStateFlow(0L)
    val commandUndeliveredAt: StateFlow<Long> = undeliveredAt.asStateFlow()

    fun applyExercise(spec: ExerciseSpec?) {
        exerciseRepository.set(spec)
    }

    fun onCommandUndelivered() {
        undeliveredAt.value = PhoneClock.now()
    }

    // v0.37.1: el desfase móvil↔reloj medido la última vez sobrevive al proceso
    private val clockPrefs = ctx.getSharedPreferences("bk_clock", Context.MODE_PRIVATE)

    init {
        if (clockPrefs.contains(KEY_CLOCK_OFFSET)) {
            PhoneClock.restore(
                PhoneClock.Sample(
                    offsetMs = clockPrefs.getLong(KEY_CLOCK_OFFSET, 0L),
                    rttMs = clockPrefs.getLong(KEY_CLOCK_RTT, PhoneClock.MAX_RTT_MS),
                    // monotónico de OTRO arranque: se da por vieja para que la primera
                    // muestra nueva la sustituya, pero mientras tanto corrige
                    atElapsedMs = Long.MIN_VALUE / 2,
                ),
            )
        }
    }

    /** Pide al móvil su hora (ver PhoneClock). Barato; se lanza con cada DataItem y al abrir la app. */
    fun syncClock() {
        CoroutineScope(Dispatchers.IO).launch { PhoneLink(ctx).pingClock() }
    }

    /** Pong del móvil: si el desfase cambia de verdad, alarmas y notificaciones se re-programan con él. */
    @Synchronized
    fun onClockPong(t0ElapsedMs: Long, phoneEpochMs: Long) {
        val before = PhoneClock.offsetMs()
        val sample = PhoneClock.onPong(t0ElapsedMs, phoneEpochMs, SystemClock.elapsedRealtime(), System.currentTimeMillis()) ?: return
        clockPrefs.edit().putLong(KEY_CLOCK_OFFSET, sample.offsetMs).putLong(KEY_CLOCK_RTT, sample.rttMs).apply()
        if (!PhoneClock.isSignificantChange(before, sample.offsetMs)) return
        Log.i(TAG, "desfase con el móvil: ${sample.offsetMs} ms (rtt ${sample.rttMs} ms), antes $before ms")
        val now = PhoneClock.now()
        val board = repository.board.value
        board.live.filter { it.kind.countsDown && !it.isFinished }.forEach { alarms.schedule(it) }
        notifier.render(board, now)
    }

    /** Lo que dice el móvil. */
    @Synchronized
    fun apply(spec: TimerSpec, nowEpochMs: Long = PhoneClock.now()) {
        if (ClockSync.isSuspicious(spec.sentAtEpochMs, nowEpochMs)) {
            Log.w(TAG, "${spec.kind.wireName}: sentAt difiere ${ClockSync.skewMs(spec.sentAtEpochMs, nowEpochMs)} ms de ahora (entrega tardía o reloj desajustado)")
        }
        // cada DataItem es una ocasión de afinar el desfase de relojes
        if (spec.running) syncClock()
        val current = repository.board.value.timers[spec.kind]
        if (!spec.running) {
            when (StopPolicy.onStopped(current, spec.reason)) {
                StopAction.IGNORE -> Log.i(TAG, "${spec.kind.wireName}: stopped/finished con la alarma ya en marcha — se mantiene hasta el OK")
                StopAction.FINISH_NOW -> onCountdownDue(spec.kind, nowEpochMs)
                StopAction.STOP -> stop(spec.kind, nowEpochMs)
            }
            return
        }
        // v0.33.2 (zurdi: "al llegar al final se abre para ver el OK y se pone a
        // parpadear, como si la app se abriese varias veces"): al abrirse por la
        // alarma, onResume relee la Data Layer y el DataItem aún dice running (el
        // móvil publica el finished 3 s después). Tratarlo como nuevo silenciaba
        // la alarma, lo daba por vencido y la rearmaba con otro full-screen
        // intent → la app se relanzaba → otra relectura. Misma instancia ya
        // terminada aquí (avisando o con OK): no hay nada que cambiar.
        if (current != null && current.isSameInstance(spec) && current.isFinished) return
        // una serie nueva mientras la anterior aún avisa: el usuario ya está a otra cosa
        if (current?.isAlarming == true) silenceAlarm(spec.kind)
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

    /** Fuera ese temporizador (cancelado en el móvil, DataItem borrado, cancelación local). Calla también la alarma. */
    @Synchronized
    fun stop(kind: TimerKind, nowEpochMs: Long = PhoneClock.now()) {
        alarms.cancel(kind)
        silenceAlarm(kind)
        val board = repository.update { it.without(kind).pruned(nowEpochMs) }
        notifier.cancelOngoing(kind)
        notifier.cancelDone(kind)
        notifier.render(board, nowEpochMs)
    }

    /**
     * Cancelación desde el propio reloj: para aquí ya (optimista) — pedirle
     * al móvil que cancele es cosa de PhoneLink.requestCancel. Si el móvil no
     * estaba al alcance, su DataItem seguirá diciendo running y lo resucitará
     * al reconectar mientras no haya vencido: converge a la verdad del móvil.
     */
    fun cancelLocally(kind: TimerKind) = stop(kind)

    /** La cuenta atrás llegó a cero (alarma, DataItem en el filo, o finished del móvil con alarma tardía). */
    @Synchronized
    fun onCountdownDue(kind: TimerKind, nowEpochMs: Long = PhoneClock.now()) {
        val current = repository.board.value.timers[kind] ?: return
        if (current.isFinished) return
        val finished = current.copy(finishedAtEpochMs = nowEpochMs)
        val board = repository.update { it.with(finished).pruned(nowEpochMs) }
        alarms.cancel(kind)
        notifier.cancelOngoing(kind)
        // v0.29.0: vibra hasta el OK (AlarmService); si ni siquiera se puede pedir, aviso único
        if (!AlarmService.start(ctx, kind)) {
            notifier.showDone(finished, alarming = false)
            Haptics.timeUp(ctx)
            acknowledge(kind, nowEpochMs)
            return
        }
        notifier.render(board, nowEpochMs)
    }

    /** El usuario se ha dado por enterado (botón, acción de la notificación, descarte) — o el tope de la alarma. */
    @Synchronized
    fun acknowledge(kind: TimerKind, nowEpochMs: Long = PhoneClock.now()) {
        val current = repository.board.value.timers[kind]
        if (current != null && current.isAlarming) {
            repository.update { it.with(current.copy(acknowledgedAtEpochMs = nowEpochMs)).pruned(nowEpochMs) }
            // v0.34.0: un OK vale para los dos — el móvil también está sonando
            CoroutineScope(Dispatchers.IO).launch { PhoneLink(ctx).requestAck(kind) }
        }
        silenceAlarm(kind)
        notifier.render(repository.board.value, nowEpochMs)
    }

    // v0.38.0: solo la alarma de ESE tipo — ver AlarmService.stopIfRunning
    private fun silenceAlarm(kind: TimerKind) {
        AlarmService.stopIfRunning(kind)
        notifier.cancelDone(kind)
    }

    /** Tras reinicio/actualización: re-pintar y re-programar desde lo persistido, y luego la verdad del móvil. */
    suspend fun rehydrate() {
        val now = PhoneClock.now()
        val board = repository.board.value
        board.live.forEach { alarms.schedule(it) }
        notifier.render(board, now)
        syncClock()
        restoreFromDataLayer()
    }

    /**
     * Lee todos los DataItems de temporizadores (y el del ejercicio actual) y
     * los aplica. Devuelve cuántos temporizadores se aplicaron (0 si la Data
     * Layer no responde).
     */
    suspend fun restoreFromDataLayer(): Int = withContext(Dispatchers.IO) {
        val uri = Uri.parse("wear://*$DATA_PREFIX")
        val buffer = try {
            Wearable.getDataClient(ctx).getDataItems(uri, DataClient.FILTER_PREFIX).await()
        } catch (e: Exception) {
            Log.w(TAG, "Data Layer no disponible", e)
            return@withContext 0
        }
        try {
            var applied = 0
            for (item in buffer) {
                if (item.uri.path == ExerciseSpec.PATH) {
                    applyExercise(ExerciseSpec.decode(DataMapFields(DataMapItem.fromDataItem(item).dataMap)))
                    continue
                }
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
        /** todo lo que publica el móvil cuelga de aquí (temporizadores y ejercicio) */
        private const val DATA_PREFIX = "/berserk/"
        private const val KEY_CLOCK_OFFSET = "offsetMs"
        private const val KEY_CLOCK_RTT = "rttMs"
        private const val TAG = "BkWear"

        @Volatile
        private var instance: TimerEngine? = null

        fun get(context: Context): TimerEngine =
            instance ?: synchronized(this) { instance ?: TimerEngine(context).also { instance = it } }
    }
}
