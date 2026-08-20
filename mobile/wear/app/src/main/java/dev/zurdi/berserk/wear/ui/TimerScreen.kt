package dev.zurdi.berserk.wear.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ProgressIndicatorDefaults
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import dev.zurdi.berserk.wear.R
import dev.zurdi.berserk.wear.TimerEngine
import dev.zurdi.berserk.wear.core.ActiveTimer
import dev.zurdi.berserk.wear.core.TimerFormat
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.notify.Haptics
import dev.zurdi.berserk.wear.sync.PhoneLink
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val TICK_MS = 250L

/** últimos segundos: el anillo y los dígitos pasan a ámbar, el halo respira y hay tic háptico 3-2-1 */
private const val URGENT_MS = 10_000L

private val RING_PADDING = 2.dp
private val RING_STROKE = 7.dp

/**
 * Una sola pantalla con cuatro estados, por prioridad: alarma esperando el
 * OK (v0.29.0), temporizador en marcha (cuenta atrás en grande con su anillo
 * con halo, el crono del entreno pequeño debajo y cancelar), y reposo
 * (estado del enlace con el móvil). La fuente de verdad es el mismo tablero
 * persistido que pintan las notificaciones; la pantalla solo hace tic.
 */
@Composable
fun TimerApp(
    engine: TimerEngine,
    link: PhoneLink,
    appVersion: String,
    notificationsGranted: Boolean,
    onAlarmAcknowledged: () -> Unit = {},
) {
    val board by engine.board.collectAsState()
    val presenceFlow = remember(link) { link.phonePresence() }
    // arranca apagada hasta la primera lectura (sub-segundo): mejor que una runa optimista
    val phonePresence by presenceFlow.collectAsState(initial = PhoneLink.PhonePresence.NONE)
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(TICK_MS)
        }
    }
    val scope = rememberCoroutineScope()

    val alarming = board.alarming()
    val primary = board.primary()

    AppScaffold {
        when {
            alarming != null -> AlarmScreen(
                timer = alarming,
                onAcknowledge = {
                    engine.acknowledge(alarming.kind)
                    onAlarmAcknowledged()
                },
            )
            primary != null -> RunningScreen(
                timer = primary,
                workout = board.workout(),
                now = now,
                onCancel = {
                    // optimista: se para aquí; si el móvil no está al alcance, su
                    // DataItem lo resucitará al reconectar mientras no haya vencido
                    engine.cancelLocally(primary.kind)
                    scope.launch { link.requestCancel(primary.kind) }
                },
            )
            else -> IdleScreen(
                presence = phonePresence,
                notificationsGranted = notificationsGranted,
                appVersion = appVersion,
            )
        }
    }
}

@Composable
private fun RunningScreen(timer: ActiveTimer, workout: ActiveTimer?, now: Long, onCancel: () -> Unit) {
    val countsDown = timer.kind.countsDown
    val remaining = timer.remainingMs(now)
    val urgent = countsDown && remaining <= URGENT_MS
    val accent = if (urgent) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary
    // el halo respira despacio en marcha y rápido en los últimos segundos
    val pulse by rememberPulse(periodMs = if (urgent) 500 else 2_400, label = "ring")
    val glow = if (urgent) pulse else 0.45f + 0.25f * pulse

    // tic háptico 3-2-1 solo mientras se mira la pantalla (la alarma de
    // verdad es la de AlarmService, con o sin pantalla)
    val context = LocalContext.current
    val secondsLeft = if (remaining <= 0L) 0L else (remaining + 999L) / 1000L
    LaunchedEffect(secondsLeft, countsDown) {
        if (countsDown && secondsLeft in 1L..3L) Haptics.tick(context)
    }

    ScreenScaffold { contentPadding ->
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (countsDown) {
                Halo(color = accent, alpha = if (urgent) 0.28f * pulse else 0.10f, radiusFraction = 0.9f)
                // v0.31.2 (zurdi: "no veo la cuenta atrás de la circunferencia
                // externa"): el anillo nítido es el indicador oficial de Material 3
                // —grueso y pegado al borde—; el halo propio va centrado en su
                // misma trayectoria (2dp de margen + media anchura de trazo)
                GlowRing(progress = timer.progress(now), color = accent, glow = glow, centerInset = RING_PADDING + RING_STROKE / 2, drawCore = false)
                CircularProgressIndicator(
                    progress = { timer.progress(now) },
                    modifier = Modifier.fillMaxSize().padding(RING_PADDING),
                    strokeWidth = RING_STROKE,
                    colors = ProgressIndicatorDefaults.colors(
                        indicatorColor = accent,
                        trackColor = accent.copy(alpha = 0.16f),
                    ),
                )
            } else {
                Halo(color = MaterialTheme.colorScheme.primary, alpha = 0.08f + 0.05f * pulse, radiusFraction = 0.8f)
            }
            Column(
                modifier = Modifier.fillMaxSize().padding(contentPadding).padding(horizontal = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = titleOf(timer),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                val scale = if (urgent) 1f + 0.05f * pulse else 1f
                Text(
                    text = if (countsDown) TimerFormat.countdown(remaining) else TimerFormat.elapsed(timer.elapsedMs(now)),
                    style = MaterialTheme.typography.numeralMedium,
                    color = accent,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                    },
                )
                if (countsDown && workout != null) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.workout_elapsed, TimerFormat.elapsed(workout.elapsedMs(now))),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
                if (countsDown) {
                    Spacer(Modifier.height(10.dp))
                    FilledTonalButton(onClick = onCancel) {
                        Text(stringResource(R.string.cancel))
                    }
                }
            }
        }
    }
}

/** v0.29.0: "¡Tiempo!" con halo al ritmo de la vibración y un OK que la para. */
@Composable
private fun AlarmScreen(timer: ActiveTimer, onAcknowledge: () -> Unit) {
    val ember = MaterialTheme.colorScheme.secondary
    // mismo periodo que el patrón de Haptics.ALARM (≈ 2 s por ciclo, ida y vuelta)
    val pulse by rememberPulse(periodMs = 1_000, label = "alarm")
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }
    val entrance by animateFloatAsState(
        targetValue = if (appeared) 1f else 0.82f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
        label = "entrance",
    )

    ScreenScaffold { contentPadding ->
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Halo(color = ember, alpha = 0.22f + 0.30f * pulse, radiusFraction = 1f)
            GlowRing(progress = 1f, color = ember, glow = pulse, track = Color.Transparent)
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(contentPadding)
                    .padding(horizontal = 20.dp)
                    .graphicsLayer {
                        scaleX = entrance
                        scaleY = entrance
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = stringResource(R.string.time_up),
                    style = MaterialTheme.typography.displaySmall,
                    color = ember,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = titleOf(timer),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onAcknowledge,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ember,
                        contentColor = MaterialTheme.colorScheme.onSecondary,
                    ),
                    modifier = Modifier.fillMaxWidth(0.62f),
                ) {
                    Text(
                        text = stringResource(R.string.ok),
                        style = MaterialTheme.typography.titleMedium,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(R.string.alarm_hint),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

/**
 * v0.32.0 (zurdi: "el texto sobra; la runa en el centro como indicador de
 * móvil conectado o no, apagada o con glow, y la versión abajo pequeñita;
 * mantén la hora arriba"). La hora la pone el AppScaffold (TimeText).
 */
/**
 * v0.32.0 (zurdi: "el texto sobra; la runa en el centro como indicador de
 * móvil conectado o no, apagada o con glow, y la versión abajo pequeñita;
 * mantén la hora arriba"). La hora la pone el AppScaffold (TimeText).
 * v0.32.1: tres estados — cerca (Bluetooth): encendida con halo que respira;
 * remoto (solo Wi-Fi/Internet): tenue, sin halo; sin móvil: apagada.
 */
@Composable
private fun IdleScreen(presence: PhoneLink.PhonePresence, notificationsGranted: Boolean, appVersion: String) {
    val aurora = MaterialTheme.colorScheme.primary
    val pulse by rememberPulse(periodMs = 3_000, label = "idle")
    val nearby = presence == PhoneLink.PhonePresence.NEARBY
    val runeTint = when (presence) {
        PhoneLink.PhonePresence.NEARBY -> aurora
        PhoneLink.PhonePresence.REMOTE -> aurora.copy(alpha = 0.55f)
        PhoneLink.PhonePresence.NONE -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
    }
    val description = stringResource(
        when (presence) {
            PhoneLink.PhonePresence.NEARBY -> R.string.phone_connected
            PhoneLink.PhonePresence.REMOTE -> R.string.phone_remote
            PhoneLink.PhonePresence.NONE -> R.string.phone_disconnected
        },
    )
    ScreenScaffold { contentPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(contentPadding), contentAlignment = Alignment.Center) {
            if (nearby) {
                Halo(color = aurora, alpha = 0.07f + 0.05f * pulse, radiusFraction = 0.7f)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(contentAlignment = Alignment.Center) {
                    if (nearby) {
                        Box(
                            modifier = Modifier
                                .size(96.dp)
                                .background(
                                    Brush.radialGradient(listOf(aurora.copy(alpha = 0.22f + 0.16f * pulse), Color.Transparent)),
                                    CircleShape,
                                ),
                        )
                    }
                    Icon(
                        painter = painterResource(R.drawable.ic_stat_berserk),
                        contentDescription = description,
                        tint = runeTint,
                        modifier = Modifier.size(44.dp),
                    )
                }
                if (!notificationsGranted) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = stringResource(R.string.notifications_needed),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.secondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 24.dp),
                    )
                }
            }
            Text(
                text = stringResource(R.string.version, appVersion),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp),
            )
        }
    }
}

@Composable
private fun titleOf(timer: ActiveTimer): String = timer.spec.title.ifEmpty {
    stringResource(
        when (timer.kind) {
            TimerKind.REST -> R.string.kind_rest
            TimerKind.CARDIO -> R.string.kind_cardio
            TimerKind.WORKOUT -> R.string.kind_workout
        },
    )
}
