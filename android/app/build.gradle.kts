import java.awt.Color
import java.awt.image.BufferedImage
import javax.imageio.ImageIO

plugins {
    id("com.android.application")
    id("com.google.gms.google-services") apply false
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    sourceSets.getByName("main").res.directories.add(layout.buildDirectory.dir("generated/publicResources").get().asFile.path)
    buildFeatures { buildConfig = true }
    namespace = "com.rinassistant.android"
    compileSdk = 37

    defaultConfig {
        fun envString(name: String): String = "\"" + providers.environmentVariable(name).orElse("").get()
            .replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""
        buildConfigField("String", "AGENT_BASE_URL", envString("RIN_AGENT_BASE_URL"))
        buildConfigField("String", "AGENT_DEVICE_ID", envString("RIN_DEVICE_ID"))
        buildConfigField("String", "COGNITO_CLIENT_ID", envString("RIN_COGNITO_CLIENT_ID"))
        buildConfigField("String", "COGNITO_USER_POOL_ID", envString("RIN_COGNITO_USER_POOL_ID"))
        buildConfigField("String", "COGNITO_REGION", envString("RIN_COGNITO_REGION"))
        applicationId = "com.rin.companion"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    val firebaseBom = platform("com.google.firebase:firebase-bom:34.19.0")

    implementation(composeBom)
    implementation(firebaseBom)
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("junit:junit:4.13.2")

    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.datastore:datastore-preferences:1.1.7")
    implementation("androidx.work:work-runtime-ktx:2.11.0")
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")

    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

// Personal Firebase configuration is optional and must stay untracked.
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

// Generate original, neutral placeholders. No private images are read or copied.
val publicResources = layout.buildDirectory.dir("generated/publicResources")
val generatePublicResources = tasks.register("generatePublicResources") {
    inputs.files(fileTree("src") { include("**/*.kt", "**/*.xml") })
    outputs.dir(publicResources)
    doLast {
        val names = mutableSetOf("mipmap/ic_launcher")
        fileTree("src") { include("**/*.kt", "**/*.xml") }.forEach { source ->
            val text = source.readText()
            Regex("R\\.(drawable|mipmap)\\.([a-z0-9_]+)").findAll(text).forEach {
                names.add(it.groupValues[1] + "/" + it.groupValues[2])
            }
            Regex("@(drawable|mipmap)/([a-z0-9_]+)").findAll(text).forEach {
                names.add(it.groupValues[1] + "/" + it.groupValues[2])
            }
        }
        names.sorted().forEachIndexed { index, name ->
            val image = BufferedImage(96, 144, BufferedImage.TYPE_INT_ARGB)
            val graphics = image.createGraphics()
            graphics.color = Color.getHSBColor((index * 0.07f) % 1f, 0.35f, 0.75f)
            graphics.fillOval(28, 12, 40, 40)
            graphics.fillRoundRect(16, 56, 64, 84, 24, 24)
            graphics.dispose()
            val output = publicResources.get().file(name + ".png").asFile
            output.parentFile.mkdirs()
            ImageIO.write(image, "png", output)
        }
    }
}
tasks.named("preBuild").configure { dependsOn(generatePublicResources) }
