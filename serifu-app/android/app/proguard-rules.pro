# ML Kit Text Recognition:
# プラグイン(google_mlkit_text_recognition)は全スクリプトのクラスを参照するが、
# 本アプリが同梱するのは日本語(+基本のラテン)のみ。未使用スクリプトの
# 欠落クラス警告を抑制する（実行時にこれらの分岐へは入らない）。
-dontwarn com.google.mlkit.vision.text.chinese.**
-dontwarn com.google.mlkit.vision.text.devanagari.**
-dontwarn com.google.mlkit.vision.text.korean.**
