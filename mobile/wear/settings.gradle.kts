// v0.28.0 — app Wear OS de berserk (zurdi: "vamos directamente a por la C").
// Proyecto Gradle INDEPENDIENTE de la shell Capacitor (mobile/android): la
// shell va con el AGP/Gradle que impone Capacitor 6 y una app Wear OS 6
// moderna necesita AGP >= 9 / compileSdk 36. Comparten solo lo que exige la
// Data Layer: applicationId (dev.zurdi.berserk) y keystore de firma.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "berserk-wear"
include(":app")
