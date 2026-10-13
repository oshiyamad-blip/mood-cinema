import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path_provider/path_provider.dart';

import '../models/script.dart';
import 'safe_file.dart';
import 'web_kv.dart';

/// 台本を端末ローカルのJSONファイルへ保存/読込する（サーバ送信なし）。
///
/// hive/sqflite でも置き換え可能だが、コード生成不要で確実なJSONファイル方式を採用。
/// 保存先はアプリ専用領域（getApplicationDocumentsDirectory）。
/// Web版（お試し版）はブラウザの localStorage に保存する
/// （そのブラウザ内のみ・サーバ送信なし。閲覧データ削除で消える）。
class ScriptStore {
  ScriptStore({this.fileName = 'scripts.json'});
  final String fileName;

  String get _webKey => 'honyomi:$fileName';

  Future<File> _file() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/$fileName');
  }

  Future<List<Script>> load() async {
    String raw = '';
    try {
      if (kIsWeb) {
        raw = WebKv.read(_webKey) ?? '';
      } else {
        final file = await _file();
        if (!await file.exists()) return [];
        raw = await file.readAsString();
      }
      if (raw.trim().isEmpty) return [];
      final result = decodeTolerant(raw);
      // 読めない台本があったら、元データを退避してから使える分だけ返す
      // （次の保存で読めなかった分が消えても、退避から復旧できるように）。
      if (result.skipped > 0) await _backup(raw);
      return result.scripts;
    } catch (_) {
      // 全体が壊れている：起動は妨げず、元データは退避しておく。
      if (raw.isNotEmpty) await _backup(raw);
      return [];
    }
  }

  Future<void> _backup(String raw) async {
    try {
      if (kIsWeb) {
        WebKv.write('$_webKey.broken', raw);
      } else {
        final file = await _file();
        await File('${file.path}.broken').writeAsString(raw, flush: true);
      }
    } catch (_) {}
  }

  /// 保存。失敗したら例外を投げる（呼び出し側が利用者に知らせるため）。
  Future<void> save(List<Script> scripts) async {
    if (kIsWeb) {
      if (!WebKv.write(_webKey, encode(scripts))) {
        throw StateError('ブラウザに保存できませんでした');
      }
      return;
    }
    await SafeFile.write(await _file(), encode(scripts));
  }

  // 以下は純粋関数（テスト可能）。

  static String encode(List<Script> scripts) =>
      jsonEncode(scripts.map((s) => s.toJson()).toList());

  static List<Script> decode(String raw) => decodeTolerant(raw).scripts;

  /// 1件ずつ読み、壊れた台本だけを飛ばす（1件の破損で全台本を失わない）。
  static ({List<Script> scripts, int skipped}) decodeTolerant(String raw) {
    final list = jsonDecode(raw) as List;
    final scripts = <Script>[];
    var skipped = 0;
    for (final e in list) {
      try {
        scripts.add(Script.fromJson(Map<String, dynamic>.from(e as Map)));
      } catch (_) {
        skipped++;
      }
    }
    return (scripts: scripts, skipped: skipped);
  }
}
