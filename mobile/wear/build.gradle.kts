// Versiones calcadas del sample oficial wear-os-samples/ComposeStarter
// (AGP 9 con Kotlin integrado: NO se aplica org.jetbrains.kotlin.android, solo
// se pone KGP en el classpath y el plugin del compilador de Compose).
buildscript {
    dependencies {
        classpath(libs.kotlin.gradle.plugin)
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.compose.compiler) apply false
}
