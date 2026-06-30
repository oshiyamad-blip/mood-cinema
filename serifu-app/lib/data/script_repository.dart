import 'package:flutter/foundation.dart';

import '../models/script.dart';

/// 台本の保管庫。MVPは端末メモリ内のみ（プライバシー既定＝オンデバイス）。
///
/// TODO(将来): sqflite / hive で端末ローカルに永続化。サーバ保存はしない。
class ScriptRepository extends ChangeNotifier {
  ScriptRepository._();
  static final ScriptRepository instance = ScriptRepository._();

  final List<Script> _scripts = [];

  List<Script> get scripts => List.unmodifiable(_scripts);

  void add(Script script) {
    _scripts.insert(0, script);
    notifyListeners();
  }

  void remove(String id) {
    _scripts.removeWhere((s) => s.id == id);
    notifyListeners();
  }

  void touch() => notifyListeners();
}
