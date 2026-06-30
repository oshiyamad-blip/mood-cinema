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

// 一部プラグイン(file_picker 等)が古い compileSdk でビルドされ、依存する
// flutter_plugin_android_lifecycle が要求する compileSdk 36 を満たさず
// AAR metadata チェックで失敗する。全プラグインモジュールの compileSdk を 36 に揃える。
// 注意: afterEvaluate の登録は下の evaluationDependsOn(":app") より前で行う
// （後だと一部プロジェクトが評価済みになり「already evaluated」で失敗する）。
subprojects {
    afterEvaluate {
        val androidExtension = extensions.findByName("android") ?: return@afterEvaluate
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

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
