import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models/script.dart';

/// 台本を端末ローカルのJSONファイルへ保存/読込する（サーバ送信なし）。
///
/// hive/sqflite でも置き換え可能だが、コード生成不要で確実なJSONファイル方式を採用。
/// 保存先はアプリ専用領域（getApplicationDocumentsDirectory）。
class ScriptStore {
  ScriptStore({this.fileName = 'scripts.json'});
  final String fileName;

  Future<File> _file() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/$fileName');
  }

  Future<List<Script>> load() async {
    try {
      final file = await _file();
      if (!await file.exists()) return [];
      final raw = await file.readAsString();
      if (raw.trim().isEmpty) return [];
      return decode(raw);
    } catch (_) {
      // 破損時は空で復帰（起動を妨げない）。
      return [];
    }
  }

  Future<void> save(List<Script> scripts) async {
    final file = await _file();
    await file.writeAsString(encode(scripts), flush: true);
  }

  // 以下は純粋関数（テスト可能）。

  static String encode(List<Script> scripts) =>
      jsonEncode(scripts.map((s) => s.toJson()).toList());

  static List<Script> decode(String raw) {
    final list = jsonDecode(raw) as List;
    return list
        .map((e) => Script.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }
}
