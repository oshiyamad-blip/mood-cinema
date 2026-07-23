import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// リリース署名情報の解決。優先順位は次のとおり：
//   1) android/key.properties（ローカル開発。gitignore 済み・コミット厳禁）
//   2) 環境変数（CI。GitHub Secrets から注入。ANDROID_KEYSTORE_* / ANDROID_KEY_*）
//   3) どちらも無ければ debug 鍵で署名（`flutter run --release` や
//      実機レビュー用APCビルドを壊さないためのフォールバック。ストア配布は不可）
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasKeystoreFile = keystorePropertiesFile.exists()
if (hasKeystoreFile) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
val envKeystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")
val hasEnvKeystore = !envKeystorePath.isNullOrBlank() && file(envKeystorePath).exists()
val useReleaseSigning = hasKeystoreFile || hasEnvKeystore

android {
    namespace = "jp.honyomi.app"
    // file_picker / flutter_plugin_android_lifecycle が compileSdk 36 を要求するため固定。
    compileSdk = maxOf(36, flutter.compileSdkVersion)
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "jp.honyomi.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // ML Kit / audioplayers / purchases_flutter 等のため最低 24。
        minSdk = maxOf(24, flutter.minSdkVersion)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (useReleaseSigning) {
            create("release") {
                if (hasKeystoreFile) {
                    keyAlias = keystoreProperties["keyAlias"] as String?
                    keyPassword = keystoreProperties["keyPassword"] as String?
                    storeFile = (keystoreProperties["storeFile"] as String?)?.let { file(it) }
                    storePassword = keystoreProperties["storePassword"] as String?
                } else {
                    keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                    keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
                    storeFile = file(envKeystorePath!!)
                    storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                }
            }
        }
    }

    buildTypes {
        release {
            // 署名鍵があれば本番署名、無ければ debug 署名にフォールバックする
            // （フォールバック時のビルドはストア配布不可・実機レビュー専用）。
            signingConfig = if (useReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

dependencies {
    // 日本語OCR。google_mlkit_text_recognition はスクリプト別の認識ライブラリを
    // 同梱しないため、日本語モデルはアプリ側で依存追加が必要
    // （無いと日本語OCRの初期化が実行時に落ちる）。
    implementation("com.google.mlkit:text-recognition-japanese:16.0.1")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
