package dev.zurdi.berserk.wear.notify

import android.content.Context
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * La vibración a 0:00 es LA feature. v0.29.0 (zurdi: "constantemente hasta
 * que yo le dé a OK"): deja de ser un golpe y pasa a un patrón que se repite
 * hasta cancel() — lo mantiene vivo AlarmService, porque el sistema corta
 * las vibraciones de un proceso que muere.
 */
object Haptics {
    // dos pulsos largos y una pausa: se distingue de una notificación normal
    private val ALARM = longArrayOf(0, 450, 250, 450, 900)

    // un único aviso, para cuando el servicio de alarma no puede arrancar
    private val TIME_UP = longArrayOf(0, 300, 150, 300, 150, 500)

    fun startAlarm(context: Context) {
        vibrate(context, VibrationEffect.createWaveform(ALARM, 0))
    }

    fun stopAlarm(context: Context) {
        vibrator(context)?.cancel()
    }

    fun timeUp(context: Context) {
        vibrate(context, VibrationEffect.createWaveform(TIME_UP, -1))
    }

    /** tic corto de los últimos segundos (3-2-1) mientras se mira la pantalla */
    fun tick(context: Context) {
        vibrator(context)?.vibrate(VibrationEffect.createOneShot(35, 140))
    }

    private fun vibrate(context: Context, effect: VibrationEffect) {
        val vibrator = vibrator(context) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // como alarma: no la apaga el perfil de notificaciones silenciadas
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
        } else {
            vibrator.vibrate(effect)
        }
    }

    private fun vibrator(context: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }
}
