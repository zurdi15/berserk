import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    alias(libs.plugins.compose.compiler)
}

// Mismo contrato que mobile/android/app/build.gradle: versión y firma llegan
// por variables de entorno (CI las fija desde el tag y el keystore secreto);
// en local caen a "dev" / 1 / sin firma de release (solo debug instalable).
val bkVersionName: String = System.getenv("BK_VERSION_NAME") ?: "dev"
val bkVersionCode: Int = (System.getenv("BK_VERSION_CODE") ?: "1").toInt()
val bkKeystoreFile: String? = System.getenv("BK_KEYSTORE_FILE")

android {
    // namespace (clase R) distinto del applicationId: el applicationId TIENE
    // que ser dev.zurdi.berserk (la Data Layer solo conecta apps con el mismo
    // paquete y la misma firma), pero el código del reloj vive en su propio
    // paquete para no confundirlo con el de la shell.
    namespace = "dev.zurdi.berserk.wear"
    // v0.31.0: los Live Updates (Now Bar del reloj con Wear OS 7 / One UI 9
    // Watch) van por NotificationCompat (core 1.17+), que compila contra 36;
    // la plataforma 37 aún se publica como "android-37.0" y AGP 9.1 no la
    // resuelve como compileSdk — no hace falta
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.zurdi.berserk"
        // Ongoing Activity API exige API 30 (Wear OS 3); el Galaxy Watch 8 va en 36
        minSdk = 30
        targetSdk = 36
        versionCode = bkVersionCode
        versionName = bkVersionName
    }

    signingConfigs {
        create("release") {
            if (bkKeystoreFile != null) {
                storeFile = file(bkKeystoreFile)
                storePassword = System.getenv("BK_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BK_KEY_ALIAS")
                keyPassword = System.getenv("BK_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // sin R8 en la primera versión: la app es diminuta y un crash por
            // una regla de keep que falte no se puede depurar sin el reloj
            // en la mano. Se activa cuando haya una tanda de pruebas reales.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (bkKeystoreFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    lint {
        abortOnError = true
        warningsAsErrors = false
    }
}

dependencies {
    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    // play-services arrastra un androidx.fragment prehistórico y el lint de
    // activity (InvalidFragmentVersionForActivityResult) lo marca como error
    // fatal: se fija uno moderno aunque la app no use fragments
    implementation(libs.androidx.fragment)
    // Compose for Wear OS: material3 SUSTITUYE a androidx.compose.material3 (no se mezclan)
    implementation(libs.wear.compose.material3)
    implementation(libs.wear.compose.foundation)
    implementation(libs.compose.ui.tooling.preview)
    // la cuenta atrás en la esfera (Status.TimerPart) y en Recientes
    implementation(libs.wear.ongoing)
    // Data Layer (DataClient / MessageClient / CapabilityClient)
    implementation(libs.play.services.wearable)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)

    debugImplementation(libs.compose.ui.tooling)
    testImplementation(libs.junit)
}
