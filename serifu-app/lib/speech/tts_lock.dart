import 'dart:async';

/// 端末TTSの排他ロック。
///
/// iOS/Android の TTS は速度・高さ・声が**エンジン全体で1つの状態**のため、
/// 事前合成（ファイル書き出し）とライブ読み上げが同時に走ると、片方の
/// 設定がもう片方の発話に混ざったり（別の役の声で読まれる）、完了通知が
/// 取り違えられたりする。設定〜発話（合成）完了までを1単位として直列化する。
class TtsLock {
  TtsLock._();

  static Future<void> _tail = Future<void>.value();

  /// [body] を他のTTS処理と重ならないように実行する。
  static Future<T> run<T>(Future<T> Function() body) {
    final previous = _tail;
    final released = Completer<void>();
    _tail = released.future;
    return previous.then((_) => body()).whenComplete(released.complete);
  }
}
