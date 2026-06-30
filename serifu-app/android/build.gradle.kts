allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// 一部プラグイン(file_picker 等)が古い compileSdk でビルドされ、
// 依存する flutter_plugin_android_lifecycle が要求する compileSdk 36 を満たさず
// AAR metadata チェックで失敗する。全プラグインモジュールの compileSdk を 36 に
// 強制してこれを解消する（AGP 型をルートに持ち込まないよう reflection を使用）。
subprojects {
    afterEvaluate {
        val androidExtension = extensions.findByName("android") ?: return@afterEvaluate
        // 新API(setCompileSdk(Integer)) / 旧API(compileSdkVersion(int)) の順に試す。
        val ok = runCatching {
            androidExtension.javaClass
                .getMethod("setCompileSdk", Integer::class.java)
                .invoke(androidExtension, 36)
        }.isSuccess
        if (!ok) {
            runCatching {
                androidExtension.javaClass
                    .getMethod("compileSdkVersion", Int::class.javaPrimitiveType)
                    .invoke(androidExtension, 36)
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
