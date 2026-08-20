package dev.zurdi.berserk.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import dev.zurdi.berserk.wear.R
import dev.zurdi.berserk.wear.TimerEngine
import dev.zurdi.berserk.wear.core.ActiveTimer
import dev.zurdi.berserk.wear.core.TimerFormat
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.sync.PhoneLink
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val TICK_MS = 250L

/**
 * Una sola pantalla con tres estados: temporizador en marcha (la cuenta
 * atrás en grande con su anillo, el crono del entreno pequeño debajo y
 * cancelar), "¡Tiempo!" unos segundos al llegar a cero, y reposo (estado del
 * enlace con el móvil). La fuente de verdad es el mismo tablero persistido
 * que pintan las notificaciones; la pantalla solo hace tic.
 */
@Composable
fun TimerApp(engine: TimerEngine, link: PhoneLink, appVersion: String, notificationsGranted: Boolean) {
    val board by engine.board.collectAsState()
    val reachableFlow = remember(link) { link.phoneReachable() }
    val phoneReachable by reachableFlow.collectAsState(initial = true)
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(TICK_MS)
        }
    }
    val scope = rememberCoroutineScope()
    var cancelFailed by remember { mutableStateOf(false) }

    val primary = board.primary()
    LaunchedEffect(primary?.kind, primary?.spec?.sentAtEpochMs) {
        if (primary != null) cancelFailed = false
    }

    AppScaffold {
        val finished = board.recentlyFinished(now)
        when {
            primary != null -> RunningScreen(
                timer = primary,
                workout = board.workout(),
                now = now,
                onCancel = {
                    engine.cancelLocally(primary.kind)
                    scope.launch { if (!link.requestCancel(primary.kind)) cancelFailed = true }
                },
            )
            finished != null -> DoneScreen(finished)
            else -> IdleScreen(
                phoneReachable = phoneReachable,
                notificationsGranted = notificationsGranted,
                cancelFailed = cancelFailed,
                appVersion = appVersion,
            )
        }
    }
}

@Composable
private fun RunningScreen(timer: ActiveTimer, workout: ActiveTimer?, now: Long, onCancel: () -> Unit) {
    val countsDown = timer.kind.countsDown
    // ScreenScaffold sin lista desplazable (el EdgeButton de M3 exige una):
    // el botón de cancelar va como FilledTonalButton al pie de la columna
    ScreenScaffold { contentPadding ->
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (countsDown) {
                CircularProgressIndicator(
                    progress = { timer.progress(now) },
                    modifier = Modifier.fillMaxSize().padding(1.dp),
                    strokeWidth = 5.dp,
                )
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
                Text(
                    text = if (countsDown) TimerFormat.countdown(timer.remainingMs(now)) else TimerFormat.elapsed(timer.elapsedMs(now)),
                    style = MaterialTheme.typography.numeralMedium,
                    color = MaterialTheme.colorScheme.primary,
                    textAlign = TextAlign.Center,
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

@Composable
private fun DoneScreen(timer: ActiveTimer) {
    ScreenScaffold { contentPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(contentPadding).padding(horizontal = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stringResource(R.string.time_up),
                style = MaterialTheme.typography.displaySmall,
                color = MaterialTheme.colorScheme.secondary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = titleOf(timer),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun IdleScreen(phoneReachable: Boolean, notificationsGranted: Boolean, cancelFailed: Boolean, appVersion: String) {
    ScreenScaffold { contentPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(contentPadding).padding(horizontal = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_stat_berserk),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.idle_title),
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = stringResource(
                    when {
                        cancelFailed -> R.string.cancel_failed
                        !notificationsGranted -> R.string.notifications_needed
                        else -> R.string.idle_hint
                    },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = stringResource(if (phoneReachable) R.string.phone_connected else R.string.phone_disconnected),
                style = MaterialTheme.typography.labelSmall,
                color = if (phoneReachable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = stringResource(R.string.version, appVersion),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
