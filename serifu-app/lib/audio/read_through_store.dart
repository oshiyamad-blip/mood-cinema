import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path_provider/path_provider.dart';

import 'read_through.dart';

/// 通し本読み（連続録音の音声＋行ごとの区間データ）の保存を管理する。
///
/// - 保存先: アプリ専用領域 `recordings/<scriptId>/readthrough.m4a` と
///   `readthrough.json`（台本と同じく端末内のみ。サーバ送信なし。
///   アンインストールで消える）
/// - 練習時は区間のある行を録音から再生し、「間」も録音どおりに置く。
/// - 事前合成の一時ファイルと違い**練習後も消さない**永続データ。
/// - Web版は非対応（録音UIを出さない）。
class ReadThroughStore {
  ReadThroughStore({Future<Directory> Function()? baseDirProvider})
      : _baseDirProvider = baseDirProvider ?? getApplicationDocumentsDirectory;

  final Future<Directory> Function() _baseDirProvider;

  Future<Directory> _dir(String scriptId, {bool create = false}) async {
    final base = await _baseDirProvider();
    final dir = Directory('${base.path}/recordings/$scriptId');
    if (create && !await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  /// 録音ファイルの保存先パス（録音開始時に渡す）。
  Future<String> audioPath(String scriptId, {bool create = false}) async =>
      '${(await _dir(scriptId, create: create)).path}/readthrough.m4a';

  Future<String> _jsonPath(String scriptId, {bool create = false}) async =>
      '${(await _dir(scriptId, create: create)).path}/readthrough.json';

  /// 保存済みの通し本読み。音声と区間が揃っていなければ null。
  Future<({ReadThroughData data, String audioPath})?> load(
      String scriptId) async {
    if (kIsWeb) return null;
    try {
      final audio = await audioPath(scriptId);
      final jsonFile = File(await _jsonPath(scriptId));
      if (!await File(audio).exists() || !await jsonFile.exists()) return null;
      final data = ReadThroughData.fromJson(Map<String, dynamic>.from(
          jsonDecode(await jsonFile.readAsString()) as Map));
      if (data.segments.isEmpty) return null;
      return (data: data, audioPath: audio);
    } catch (_) {
      return null; // 壊れたデータは「無し」扱い（練習は既定動作に縮退）
    }
  }

  Future<void> save(String scriptId, ReadThroughData data) async {
    final file = File(await _jsonPath(scriptId, create: true));
    await file.writeAsString(jsonEncode(data.toJson()));
  }

  /// 通し録音を消す（音声・区間の両方）。
  Future<void> delete(String scriptId) async {
    try {
      await File(await audioPath(scriptId)).delete();
    } catch (_) {}
    try {
      await File(await _jsonPath(scriptId)).delete();
    } catch (_) {}
  }

  /// 台本削除時などに録音ごと消す。
  Future<void> deleteAll(String scriptId) async {
    try {
      final dir = await _dir(scriptId);
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (_) {}
  }

  /// 練習後クリーンアップで消してはいけないパスか（録音は永続）。
  static bool isRecordingPath(String path) => path.contains('/recordings/');
}
