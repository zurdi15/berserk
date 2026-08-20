package dev.zurdi.berserk.wear.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme

// tokens de berserk (frontend/src/tokens/index.ts, tema oscuro): el reloj es
// siempre oscuro, así que solo hay una paleta
val Aurora = Color(0xFF4FD8C4)
val AuroraDeep = Color(0xFF2BA893)
val Ember = Color(0xFFFF8A3D)
val Ink = Color(0xFFE8EDF2)
val InkMuted = Color(0xFF9AA4B2)
val Void = Color(0xFF0A0C0F)

private val BerserkColors = ColorScheme(
    primary = Aurora,
    primaryDim = AuroraDeep,
    onPrimary = Void,
    primaryContainer = Color(0xFF12363A),
    onPrimaryContainer = Aurora,
    secondary = Ember,
    onSecondary = Void,
    background = Color.Black,
    onBackground = Ink,
    onSurface = Ink,
    onSurfaceVariant = InkMuted,
)

@Composable
fun BerserkWearTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = BerserkColors, content = content)
}
