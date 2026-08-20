package dev.zurdi.berserk.wear.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * v0.29.0 (zurdi: "molarían algunos efectos visuales de glow"). Todo el
 * brillo es pintura barata: un arco ancho y translúcido bajo el arco fino, y
 * un gradiente radial de fondo — nada de blur por RenderEffect, que en un
 * reloj cuesta batería. Lo que "respira" es solo la opacidad.
 */

/** 0.55 → 1 → 0.55 en bucle; el periodo marca el ritmo (la alarma va al de su vibración) */
@Composable
fun rememberPulse(periodMs: Int, label: String = "pulse"): State<Float> {
    val transition = rememberInfiniteTransition(label = label)
    return transition.animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(periodMs, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "$label-alpha",
    )
}

/**
 * Halo de progreso: un arco ANCHO y translúcido centrado a [centerInset] del
 * borde (donde pasa el anillo nítido que se pinte encima) y, si [drawCore],
 * también el arco fino y la pista. v0.31.2: en la pantalla de cuenta atrás el
 * anillo nítido lo pinta el CircularProgressIndicator de Material 3 y aquí
 * solo queda el halo; el arco propio sigue en la pantalla de alarma.
 */
@Composable
fun GlowRing(
    progress: Float,
    color: Color,
    glow: Float,
    modifier: Modifier = Modifier,
    centerInset: Dp = 13.dp,
    haloWidth: Dp = 22.dp,
    drawCore: Boolean = true,
    track: Color = Color.White.copy(alpha = 0.08f),
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val stroke = 6.dp.toPx()
        val halo = haloWidth.toPx()
        val inset = centerInset.toPx()
        val arcSize = Size(size.width - inset * 2f, size.height - inset * 2f)
        val topLeft = Offset(inset, inset)
        if (drawCore) {
            drawArc(track, -90f, 360f, false, topLeft, arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        val sweep = 360f * progress.coerceIn(0f, 1f)
        if (sweep > 0f) {
            drawArc(color.copy(alpha = 0.30f * glow), -90f, sweep, false, topLeft, arcSize, style = Stroke(halo, cap = StrokeCap.Round))
            if (drawCore) {
                drawArc(color, -90f, sweep, false, topLeft, arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
            }
        }
    }
}

/** Halo radial de fondo (centro → transparente). */
@Composable
fun Halo(color: Color, alpha: Float, modifier: Modifier = Modifier, radiusFraction: Float = 0.75f) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    0f to color.copy(alpha = alpha.coerceIn(0f, 1f)),
                    radiusFraction to Color.Transparent,
                    1f to Color.Transparent,
                ),
            ),
    )
}
