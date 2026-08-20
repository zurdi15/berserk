package dev.zurdi.berserk.wear.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.lifecycleScope
import dev.zurdi.berserk.wear.BuildConfig
import dev.zurdi.berserk.wear.TimerEngine
import dev.zurdi.berserk.wear.sync.PhoneLink
import dev.zurdi.berserk.wear.ui.theme.BerserkWearTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private lateinit var engine: TimerEngine
    private val notificationsGranted = mutableStateOf(true)

    // v0.30.0: lanzada por el full-screen intent de la alarma → el OK devuelve a la esfera
    private var openedByAlarm = false
    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            notificationsGranted.value = granted
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // la alarma tiene que verse aunque el reloj esté bloqueado y con la pantalla apagada
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        openedByAlarm = intent?.getBooleanExtra(EXTRA_FROM_ALARM, false) == true
        engine = TimerEngine.get(this)
        val link = PhoneLink(this)
        setContent {
            BerserkWearTheme {
                TimerApp(
                    engine = engine,
                    link = link,
                    appVersion = BuildConfig.VERSION_NAME,
                    notificationsGranted = notificationsGranted.value,
                    onAlarmAcknowledged = { if (openedByAlarm) finishAndRemoveTask() },
                )
            }
        }
        ensureNotificationPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(EXTRA_FROM_ALARM, false)) openedByAlarm = true
    }

    override fun onResume() {
        super.onResume()
        // por si se perdió algún evento (app recién instalada, Play services
        // reiniciado): la Data Layer guarda el último estado de cada temporizador
        lifecycleScope.launch { engine.restoreFromDataLayer() }
    }

    /** Sin POST_NOTIFICATIONS no hay ongoing ni Ongoing Activity: se pide la primera vez que se abre la app. */
    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        notificationsGranted.value = granted
        if (!granted) requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    companion object {
        const val EXTRA_FROM_ALARM = "dev.zurdi.berserk.wear.FROM_ALARM"
    }
}
