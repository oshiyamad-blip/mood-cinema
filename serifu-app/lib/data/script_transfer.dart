import 'dart:convert';

import '../models/script.dart';

/// 台本の書き出し/読み込み（.honyomi ファイル）。
///
/// 用途は2つ：
/// - **バックアップ**: データは端末内にのみあるため、機種変更・アプリ削除で
///   消える。ファイルに書き出しておけば戻せる。
/// - **共有**: 稽古場で共演者に台本（解析済み・役設定込み）をそのまま渡せる。
///
/// 形式はバージョン付きJSON。台本テキストのみで録音（通し録音）は含まない
/// （音声はサイズが大きく、相手の端末では自分たちで録り直すのが自然なため）。
class ScriptTransfer {
  static const formatName = 'honyomi-script';
  static const formatVersion = 1;
  static const fileExtension = 'honyomi';

  /// 台本を共有用JSON文字列に書き出す。
  static String encode(Script script) {
    return const JsonEncoder.withIndent('  ').convert({
      'format': formatName,
      'version': formatVersion,
      'script': script.toJson(),
    });
  }

  /// 共有ファイルの内容から台本を復元する。
  ///
  /// - IDは取り込み側で新規採番（既存台本との衝突・上書きを防ぐ）
  /// - 練習履歴（lastPracticedAt）は引き継がない
  /// 不正な内容は [FormatException] を投げる。
  static Script decode(String content) {
    final Object? root;
    try {
      root = jsonDecode(content);
    } catch (_) {
      throw const FormatException('JSONとして読み取れません');
    }
    if (root is! Map || root['format'] != formatName) {
      throw const FormatException('ホンヨミの台本ファイルではありません');
    }
    final version = (root['version'] as num?)?.toInt() ?? 0;
    if (version < 1 || version > formatVersion) {
      throw const FormatException('このバージョンのアプリでは読み込めない形式です（アプリを更新してください）');
    }
    final raw = root['script'];
    if (raw is! Map) {
      throw const FormatException('台本データが含まれていません');
    }
    final script = Script.fromJson(Map<String, dynamic>.from(raw));
    if (script.lines.isEmpty) {
      throw const FormatException('台本に行がありません');
    }
    // 新規採番＋履歴リセットで「新しい台本」として取り込む。
    return Script(
      id: 's${DateTime.now().microsecondsSinceEpoch}',
      title: script.title,
      characters: script.characters,
      lines: script.lines,
      importedAt: DateTime.now(),
      voiceByCharacter: script.voiceByCharacter,
      myCharacter: script.myCharacter,
      readDirections: script.readDirections,
    );
  }

  /// 書き出しファイル名（タイトルから安全な名前を作る）。
  static String fileNameFor(Script script) {
    final safe = script.title
        .replaceAll(RegExp(r'[\\/:*?"<>|]'), '_')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    final base = safe.isEmpty ? 'script' : safe;
    return '$base.$fileExtension';
  }
}
