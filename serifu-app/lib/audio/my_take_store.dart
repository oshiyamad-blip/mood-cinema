import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path_provider/path_provider.dart';

/// 練習中の「自分のセリフ」の自動録音の保存先を管理する。
///
/// - 保存先: `recordings/<scriptId>/mytake/<lineId>.m4a`
///   （recordings/ 以下なので練習後クリーンアップから保護され、
///   台本削除と一緒に消える。端末内のみ・サーバ送信なし）
/// - **直近の練習1回分だけ**を保持する（新しい練習の開始時に前回分を消す）。
///   リザルトの「つまずいた行」から自分の演技を聞き返す用途のため。
/// - Web版は非対応（録音自体を行わない）。
class MyTakeStore {
  MyTakeStore({Future<Directory> Function()? baseDirProvider})
      : _baseDirProvider = baseDirProvider ?? getApplicationDocumentsDirectory;

  final Future<Directory> Function() _baseDirProvider;

  Future<Directory> _dir(String scriptId, {bool create = false}) async {
    final base = await _baseDirProvider();
    final dir = Directory('${base.path}/recordings/$scriptId/mytake');
    if (create && !await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  /// 行ごとの録音ファイルの保存先パス（録音開始時に渡す）。
  Future<String> pathFor(String scriptId, String lineId) async {
    final dir = await _dir(scriptId, create: true);
    return '${dir.path}/$lineId.m4a';
  }

  /// この台本の録音済み一覧（lineId → パス）。
  Future<Map<String, String>> loadAll(String scriptId) async {
    if (kIsWeb) return {};
    try {
      final dir = await _dir(scriptId);
      if (!await dir.exists()) return {};
      final map = <String, String>{};
      await for (final e in dir.list()) {
        if (e is File && e.path.endsWith('.m4a')) {
          final name = e.uri.pathSegments.last;
          map[name.substring(0, name.length - 4)] = e.path;
        }
      }
      return map;
    } catch (_) {
      return {};
    }
  }

  /// 新しい練習の開始時に前回分を消す（直近1回分だけを保持）。
  Future<void> clear(String scriptId) async {
    try {
      final dir = await _dir(scriptId);
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (_) {}
  }
}
