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
import android.graphics.BlurMaskFilter
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.PaintingStyle
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * v0.29.0 (zurdi: "molarían algunos efectos visuales de glow"). Todo el
 * brillo es pintura barata: un gradiente radial de fondo y, desde v0.35.3, un
 * arco desenfocado con BlurMaskFilter bajo el arco fino (un blur de Paint,
 * no un RenderEffect de capa entera). Lo que "respira" es solo la opacidad.
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
    centerInset: Dp = RING_CENTER_INSET,
    haloWidth: Dp = 22.dp,
    drawCore: Boolean = true,
    /** grados desde las 3 en punto, en sentido horario (el convenio de drawArc y de Material 3) */
    startAngle: Float = RING_START_ANGLE,
    /** recorrido total del arco al 100 % — menos de 360 deja un hueco (para la hora de arriba) */
    maxSweep: Float = RING_SWEEP,
    track: Color = Color.White.copy(alpha = 0.08f),
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val stroke = 6.dp.toPx()
        val inset = centerInset.toPx()
        val arcSize = Size(size.width - inset * 2f, size.height - inset * 2f)
        val topLeft = Offset(inset, inset)
        if (drawCore) {
            drawArc(track, startAngle, maxSweep, false, topLeft, arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        val sweep = maxSweep * progress.coerceIn(0f, 1f)
        if (sweep > 0f) {
            // v0.35.3 (zurdi: "el glow es muy tosco; más sutil y difuminado"): un
            // desenfoque gaussiano real (BlurMaskFilter) sobre un trazo algo más
            // ancho que el arco, en vez de la banda translúcida de antes
            drawIntoCanvas { canvas ->
                val paint = Paint().apply {
                    style = PaintingStyle.Stroke
                    strokeWidth = stroke * 2.2f
                    strokeCap = StrokeCap.Round
                    this.color = color.copy(alpha = 0.22f * glow)
                    asFrameworkPaint().maskFilter = BlurMaskFilter(haloWidth.toPx() * 0.55f, BlurMaskFilter.Blur.NORMAL)
                }
                canvas.drawArc(
                    Rect(topLeft, arcSize), startAngle, sweep, false, paint,
                )
            }
            if (drawCore) {
                drawArc(color, startAngle, sweep, false, topLeft, arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
            }
        }
    }
}

/**
 * v0.35.1 (zurdi, con el anillo por fin visible: "como no era un tema
 * estético, déjalo como la primera versión, ahora lo veo muy gordo"): el
 * diseño de v0.29 — trazo de 6 dp con su halo, círculo completo desde las
 * 12, centrado a 13 dp del borde. El "anillo invisible" nunca fue el dibujo:
 * era totalMs = 0 (ver BkOngoingPlugin.optLong); lo de v0.34.0 (16 dp, 8 dp,
 * hueco de 60°) fue un palo de ciego y se retira.
 */
val RING_CENTER_INSET: Dp = 13.dp
const val RING_START_ANGLE = -90f
const val RING_SWEEP = 360f

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
