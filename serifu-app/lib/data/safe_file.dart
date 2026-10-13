import 'dart:async';
import 'dart:io';

/// 端末ファイルへの安全な書き込み（台本・設定・練習記録の保存に使う）。
///
/// - 同じファイルへの書き込みを**直列化**する（スライダー操作などで保存が
///   連続しても、長さの違う内容が混ざって末尾にゴミが残ることがない）
/// - 一時ファイルに書き切ってから**置き換える**（途中でアプリが落ちても、
///   前回の正しい内容が残る）
class SafeFile {
  SafeFile._();

  static final Map<String, Future<void>> _queues = {};

  static Future<void> write(File file, String content) {
    final path = file.path;
    final previous = _queues[path] ?? Future<void>.value();
    final next = previous.then((_) async {
      final tmp = File('$path.tmp');
      await tmp.writeAsString(content, flush: true);
      await tmp.rename(path);
    });
    // 失敗しても後続の書き込みは続けられるようにする（失敗は呼び出し側へ返す）。
    _queues[path] = next.catchError((_) {});
    return next;
  }
}

/// 非同期処理を1本ずつ順番に実行するキュー（読み→変更→書きの競合防止）。
class SerialQueue {
  Future<void> _tail = Future<void>.value();

  Future<T> run<T>(Future<T> Function() body) {
    final previous = _tail;
    final released = Completer<void>();
    _tail = released.future;
    return previous.then((_) => body()).whenComplete(released.complete);
  }
}
