package dev.zurdi.berserk.wear.notify

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** La vibración a 0:00 es LA feature: se dispara explícita, no solo por el canal de la notificación. */
object Haptics {
    // tres golpes, como el navigator.vibrate del fin de descanso en la web pero más largos para la muñeca
    private val TIME_UP = longArrayOf(0, 300, 150, 300, 150, 500)

    fun timeUp(context: Context) {
        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }
        vibrator?.vibrate(VibrationEffect.createWaveform(TIME_UP, -1))
    }
}
