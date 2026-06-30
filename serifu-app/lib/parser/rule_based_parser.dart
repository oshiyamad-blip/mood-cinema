import '../models/script.dart';

/// 解析結果。
class ParsedScript {
  ParsedScript({required this.characters, required this.lines});
  final List<String> characters;
  final List<Line> lines;
}

/// 日本語台本のルールベース解析器（端末内・完全オフライン）。
///
/// 日本語シナリオの定石に基づき、生テキストを役名・セリフ・ト書きへ分解する。
/// 解析は完璧にならない前提のため、結果はユーザーの確認・修正UIを通すこと。
///
/// 対応する代表的な書式：
///   太郎「おはよう」     … 役名＋カギカッコ
///   太郎：おはよう       … 役名＋コロン（全角/半角）
///   （ため息をつく）     … ト書き（カッコ書き）
///   ………地の文………    … ト書き（説明文）
class RuleBasedParser {
  /// 役名＋セパレータ＋本文。役名はカッコ・空白・コロンを含まない1〜10文字。
  static final RegExp _dialogue =
      RegExp(r'^[\s　]*([^\s　「『（(:：]{1,10})[\s　]*[「『:：](.*)$');

  /// カッコのみで囲まれた行＝ト書き。
  static final RegExp _direction = RegExp(r'^[\s　]*[（(].*[)）][\s　]*$');

  /// 「登場人物」見出し。
  static final RegExp _castHeader = RegExp(r'^[\s　]*(登場人物|配役|キャスト)[:：]?[\s　]*$');

  ParsedScript parse(String raw) {
    final rawLines = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');

    final lines = <Line>[];
    final characters = <String>{};
    var counter = 0;
    var inCastBlock = false;
    Line? lastDialogue;

    String nextId() => 'l${counter++}';

    for (final rawLine in rawLines) {
      final line = rawLine.trimRight();
      final trimmed = line.trim();
      if (trimmed.isEmpty) {
        inCastBlock = false;
        lastDialogue = null;
        continue;
      }

      // 「登場人物」ブロック：以降の短い行を役名辞書として拾う。
      if (_castHeader.hasMatch(trimmed)) {
        inCastBlock = true;
        continue;
      }
      if (inCastBlock) {
        if (trimmed.length <= 12 && !_dialogue.hasMatch(trimmed)) {
          characters.add(_cleanName(trimmed));
          continue;
        }
        inCastBlock = false;
      }

      // ト書き（カッコ書き）。
      if (_direction.hasMatch(trimmed)) {
        lines.add(Line(id: nextId(), type: LineType.direction, text: _stripParens(trimmed)));
        lastDialogue = null;
        continue;
      }

      // 役名＋セリフ。
      final m = _dialogue.firstMatch(trimmed);
      if (m != null) {
        final speaker = _cleanName(m.group(1)!);
        final body = _stripQuotes(m.group(2)!.trim());
        characters.add(speaker);
        final l = Line(id: nextId(), type: LineType.dialogue, speaker: speaker, text: body);
        lines.add(l);
        lastDialogue = l;
        continue;
      }

      // 直前がセリフで、本行が新たな話者・ト書きでない → セリフの継続行として連結。
      if (lastDialogue != null) {
        final cont = _stripQuotes(trimmed);
        lastDialogue.text = lastDialogue.text.isEmpty ? cont : '${lastDialogue.text}$cont';
        continue;
      }

      // それ以外の地の文 → ト書き扱い。
      lines.add(Line(id: nextId(), type: LineType.direction, text: trimmed));
    }

    return ParsedScript(characters: characters.toList(), lines: lines);
  }

  String _cleanName(String s) => s.replaceAll(RegExp(r'[（(].*[)）]'), '').trim();

  String _stripParens(String s) {
    final t = s.trim();
    return t.replaceFirst(RegExp(r'^[（(]'), '').replaceFirst(RegExp(r'[)）]$'), '').trim();
  }

  String _stripQuotes(String s) {
    var t = s.trim();
    t = t.replaceFirst(RegExp(r'^[「『]'), '');
    t = t.replaceFirst(RegExp(r'[」』]$'), '');
    return t.trim();
  }
}
