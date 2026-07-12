import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path_provider/path_provider.dart';

import 'web_kv.dart';

/// 1回の練習の記録（進捗の可視化用・端末内のみ）。
class PracticeRecord {
  const PracticeRecord({
    required this.at,
    required this.durationSec,
    required this.stuckCount,
    required this.myLineCount,
    this.listenMode = false,
    this.focus = false,
  });

  final DateTime at;
  final int durationSec;

  /// 「つまずいたかも」と推定された行数。
  final int stuckCount;

  /// 自分のセリフ数（仕上がり度の分母）。
  final int myLineCount;

  /// 聞き流しモードだったか（仕上がり比較には使わない）。
  final bool listenMode;

  /// 部分練習（つまずいた行だけ）だったか（同上）。
  final bool focus;

  /// 通し稽古（仕上がり比較の対象になる記録）か。
  bool get isFullRun => !listenMode && !focus;

  /// 仕上がり度（0〜100）：自分のセリフのうち詰まらなかった割合。
  int get score => myLineCount <= 0
      ? 100
      : (100 * (myLineCount - stuckCount).clamp(0, myLineCount) ~/ myLineCount);

  Map<String, dynamic> toJson() => {
        'at': at.toIso8601String(),
        'durationSec': durationSec,
        'stuckCount': stuckCount,
        'myLineCount': myLineCount,
        'listenMode': listenMode,
        'focus': focus,
      };

  factory PracticeRecord.fromJson(Map<String, dynamic> json) => PracticeRecord(
        at: DateTime.tryParse(json['at'] as String? ?? '') ?? DateTime(2000),
        durationSec: (json['durationSec'] as num?)?.toInt() ?? 0,
        stuckCount: (json['stuckCount'] as num?)?.toInt() ?? 0,
        myLineCount: (json['myLineCount'] as num?)?.toInt() ?? 0,
        listenMode: json['listenMode'] as bool? ?? false,
        focus: json['focus'] as bool? ?? false,
      );
}

/// 台本ごとの練習記録の保存（進捗の可視化用）。
///
/// - 端末内のみ（モバイル: documents/practice_log.json、Web: localStorage）
/// - 台本ごとに直近 [maxPerScript] 件だけ保持
class PracticeLog {
  PracticeLog({Future<Directory> Function()? baseDirProvider})
      : _baseDirProvider = baseDirProvider ?? getApplicationDocumentsDirectory;

  final Future<Directory> Function() _baseDirProvider;

  static const _webKey = 'honyomi:practice_log.json';
  static const maxPerScript = 50;

  Future<File> _file() async =>
      File('${(await _baseDirProvider()).path}/practice_log.json');

  Future<Map<String, List<PracticeRecord>>> _loadAll() async {
    try {
      final String raw;
      if (kIsWeb) {
        raw = WebKv.read(_webKey) ?? '';
      } else {
        final f = await _file();
        raw = await f.exists() ? await f.readAsString() : '';
      }
      if (raw.isEmpty) return {};
      final map = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      return map.map((k, v) => MapEntry(
            k,
            [
              for (final e in (v as List))
                PracticeRecord.fromJson(Map<String, dynamic>.from(e as Map)),
            ],
          ));
    } catch (_) {
      return {}; // 壊れたログは読み捨て（練習機能は影響を受けない）
    }
  }

  Future<void> _saveAll(Map<String, List<PracticeRecord>> all) async {
    final raw = jsonEncode(
        all.map((k, v) => MapEntry(k, [for (final r in v) r.toJson()])));
    try {
      if (kIsWeb) {
        WebKv.write(_webKey, raw);
      } else {
        await (await _file()).writeAsString(raw);
      }
    } catch (_) {}
  }

  /// 練習1回分を追記する（古いものから間引いて上限を維持）。
  Future<void> add(String scriptId, PracticeRecord record) async {
    final all = await _loadAll();
    final list = [...(all[scriptId] ?? const <PracticeRecord>[]), record];
    if (list.length > maxPerScript) {
      list.removeRange(0, list.length - maxPerScript);
    }
    all[scriptId] = list;
    await _saveAll(all);
  }

  /// この台本の記録（古い順）。
  Future<List<PracticeRecord>> forScript(String scriptId) async =>
      (await _loadAll())[scriptId] ?? const [];

  /// 台本削除時に記録も消す。
  Future<void> remove(String scriptId) async {
    final all = await _loadAll();
    if (all.remove(scriptId) != null) await _saveAll(all);
  }
}

/// 直近の通し稽古とその1つ前を返す（リザルトの「前回比」表示用）。
({PracticeRecord latest, PracticeRecord? previous})? latestFullRuns(
    List<PracticeRecord> records) {
  final full = records.where((r) => r.isFullRun).toList();
  if (full.isEmpty) return null;
  return (
    latest: full.last,
    previous: full.length >= 2 ? full[full.length - 2] : null,
  );
}
