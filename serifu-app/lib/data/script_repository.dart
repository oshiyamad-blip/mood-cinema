import 'package:flutter/foundation.dart';

import '../models/script.dart';
import 'script_store.dart';

/// 台本の保管庫。端末ローカル（JSONファイル）に永続化する。
/// プライバシー要件：サーバへは送信しない（オンデバイス）。
class ScriptRepository extends ChangeNotifier {
  ScriptRepository._();
  static final ScriptRepository instance = ScriptRepository._();

  final ScriptStore _store = ScriptStore();
  final List<Script> _scripts = [];
  bool _loaded = false;

  List<Script> get scripts => List.unmodifiable(_scripts);
  bool get loaded => _loaded;

  /// 起動時に1回呼ぶ。保存済みの台本を読み込む。
  Future<void> init() async {
    if (_loaded) return;
    final saved = await _store.load();
    _scripts
      ..clear()
      ..addAll(saved);
    _loaded = true;
    notifyListeners();
  }

  void add(Script script) {
    _scripts.insert(0, script);
    _persist();
    notifyListeners();
  }

  void remove(String id) {
    _scripts.removeWhere((s) => s.id == id);
    _persist();
    notifyListeners();
  }

  /// 既存台本の編集後など、保存と再描画をまとめて行う。
  void touch() {
    _persist();
    notifyListeners();
  }

  void _persist() {
    // 失敗してもUIは止めない（容量不足・権限等のフォールバック）。
    _store.save(List.of(_scripts)).catchError((_) {});
  }
}
