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
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.withFrameMillis
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
import androidx.wear.compose.material3.CompactButton
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import dev.zurdi.berserk.wear.R
import dev.zurdi.berserk.wear.TimerEngine
import dev.zurdi.berserk.wear.core.ActiveTimer
import dev.zurdi.berserk.wear.core.PhoneClock
import dev.zurdi.berserk.wear.core.TimerFormat
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.notify.Haptics
import dev.zurdi.berserk.wear.sync.PhoneLink
import dev.zurdi.berserk.wear.ui.theme.Slab
import kotlinx.coroutines.launch

/** últimos segundos: el anillo y los dígitos pasan a ámbar, el halo respira y hay tic háptico 3-2-1 */
private const val URGENT_MS = 10_000L

/** v0.35.1: OK y Cancelar, compactos y del mismo ancho */
private val ACTION_WIDTH = 104.dp


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
    var now by remember { mutableLongStateOf(PhoneClock.now()) }
    // v0.35.4 (zurdi: "que el anillo se vaya pintando progresivamente en vez de
    // a saltitos"): el reloj de la pantalla avanza por FOTOGRAMA mientras la
    // app está abierta (antes, cada 250 ms — 1,5° por tic en un descanso de
    // 60 s, que se notaba); el halo ya animaba así, el coste es el mismo
    LaunchedEffect(Unit) {
        while (true) {
            withFrameMillis { now = PhoneClock.now() }
        }
    }
    // v0.37.1: al abrir la app y al (re)aparecer el móvil, afinar el desfase de relojes
    LaunchedEffect(phonePresence) {
        if (phonePresence != PhoneLink.PhonePresence.NONE) engine.syncClock()
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
                // v0.33.1: el arco es el tiempo TRANSCURRIDO (empieza vacío) sobre
                // una pista gris tenue — la fracción restante llenaba el anillo
                // casi entero desde el principio y se leía como fondo
                // v0.35.1: el anillo de la primera versión (pista tenue, halo y arco
                // fino), que se llena con el tiempo transcurrido
                GlowRing(progress = timer.elapsedFraction(now), color = accent, glow = glow)
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
                    // v0.35.1: botón compacto, mismo ancho que el OK de la alarma;
                    // colores explícitos (el tonal por defecto de M3 salía lavanda)
                    CompactButton(
                        onClick = onCancel,
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Slab,
                            contentColor = MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.width(ACTION_WIDTH),
                    ) {
                        // v0.35.3: centrado explícito — el CompactButton reserva sitio para un icono
                        Text(text = stringResource(R.string.cancel), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        }
    }
}

/**
 * v0.29.0: alarma con halo al ritmo de la vibración y un OK que la para.
 * v0.35.0 (zurdi: "esos textos son innecesarios y tienen ruido; en la esfera
 * está todo un pelín apelotonado, el OK un pelín más pequeño"): sin título
 * ni ayuda — el halo ámbar y el nombre ya dicen qué pasa; OK al 46 % del ancho.
 */
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
            GlowRing(progress = 1f, color = ember, glow = pulse, startAngle = -90f, maxSweep = 360f, track = Color.Transparent)
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(contentPadding)
                    .padding(horizontal = 26.dp)
                    .graphicsLayer {
                        scaleX = entrance
                        scaleY = entrance
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = titleOf(timer),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(16.dp))
                CompactButton(
                    onClick = onAcknowledge,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ember,
                        contentColor = MaterialTheme.colorScheme.onSecondary,
                    ),
                    modifier = Modifier.width(ACTION_WIDTH),
                ) {
                    Text(text = stringResource(R.string.ok), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}

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

// v0.36.1 (zurdi: "en el title deja solo el nombre del ejercicio"): el móvil
// manda "Descanso · Press banca" / "Cardio · Correr" (así lo lee la
// notificación, que no tiene más contexto), pero en la esfera el anillo y el
// número ya dicen qué es — se queda solo lo que va tras el último separador.
// Lo mismo con la línea del crono del entreno bajo la cuenta atrás: sin
// "Entrenando ·", solo el tiempo (strings.xml).
private const val TITLE_SEPARATOR = " · "

internal fun displayTitle(title: String): String {
    val idx = title.lastIndexOf(TITLE_SEPARATOR)
    if (idx < 0) return title
    return title.substring(idx + TITLE_SEPARATOR.length).trim().ifEmpty { title }
}

@Composable
private fun titleOf(timer: ActiveTimer): String = displayTitle(timer.spec.title).ifEmpty {
    stringResource(
        when (timer.kind) {
            TimerKind.REST -> R.string.kind_rest
            TimerKind.CARDIO -> R.string.kind_cardio
            TimerKind.WORKOUT -> R.string.kind_workout
        },
    )
}
