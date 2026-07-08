import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path_provider/path_provider.dart';

/// 本読み録音（実際の声の吹き込み）の保存場所を管理する。
///
/// - 保存先: アプリ専用領域 `recordings/<scriptId>/<lineId>.m4a`
///   （台本と同じく端末内のみ。サーバ送信なし。アンインストールで消える）
/// - 練習時は該当行の録音をTTSより優先して再生する。
/// - 事前合成の一時ファイルと違い**練習後も消さない**永続データ。
/// - Web版は非対応（録音UIを出さない）。
class RecordingStore {
  RecordingStore({Future<Directory> Function()? baseDirProvider})
      : _baseDirProvider = baseDirProvider ?? getApplicationDocumentsDirectory;

  final Future<Directory> Function() _baseDirProvider;

  Future<Directory> _scriptDir(String scriptId, {bool create = false}) async {
    final base = await _baseDirProvider();
    final dir = Directory('${base.path}/recordings/$scriptId');
    if (create && !await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  /// 録音ファイルの保存先パス（録音開始時に渡す）。
  Future<String> pathFor(String scriptId, String lineId) async {
    final dir = await _scriptDir(scriptId, create: true);
    return '${dir.path}/$lineId.m4a';
  }

  /// この台本の録音済み一覧（lineId → パス）。
  Future<Map<String, String>> loadAll(String scriptId) async {
    if (kIsWeb) return {};
    try {
      final dir = await _scriptDir(scriptId);
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

  Future<void> delete(String scriptId, String lineId) async {
    try {
      final dir = await _scriptDir(scriptId);
      await File('${dir.path}/$lineId.m4a').delete();
    } catch (_) {}
  }

  /// 台本削除時などに録音ごと消す。
  Future<void> deleteAll(String scriptId) async {
    try {
      final dir = await _scriptDir(scriptId);
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (_) {}
  }

  /// 練習後クリーンアップで消してはいけないパスか（録音は永続）。
  static bool isRecordingPath(String path) => path.contains('/recordings/');
}
