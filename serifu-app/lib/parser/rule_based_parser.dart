import '../models/script.dart';

/// 解析結果。
class ParsedScript {
  ParsedScript({required this.characters, required this.lines});
  final List<String> characters;
  final List<Line> lines;
}

/// 日本語台本のルールベース解析器（端末内・完全オフライン）。
///
/// 方針：**1行 = セリフかト書きのどちらか**（日本語台本では1行に両者は同居しない）。
/// 行頭の形だけで行単位に判定し、細かい分割はしない。
/// 唯一の例外は「 』が閉じるまで続く複数行セリフで、これは1つのセリフに連結する。
///
/// 2パス構成：
///   パス1: 役名辞書を作る（「登場人物」ブロック／カギカッコ形式の話者／
///          コロン形式で2回以上現れた話者）
///   パス2: 辞書を使って行を分類する
///     ・柱（○駅前 等）・カッコ完結行・字下げ行・その他の地の文 → ト書き
///     ・名前「セリフ」／辞書にある名前：セリフ → セリフ
///     ・辞書にある役名だけの行 → 次の行から（空行まで）をその話者のセリフ（戯曲形式）
///     ・ページ番号だけの行 → 無視
///
/// 解析は完璧にならない前提のため、結果は必ず確認・修正UIを通すこと。
class RuleBasedParser {
  /// 役名＋カギカッコ。例: 太郎「おはよう」 / 太郎『…』
  static final RegExp _bracketForm =
      RegExp(r'^[\s　]*([^\s　「『（(）)：:]{1,10})[\s　]*([「『])(.*)$');

  /// 役名＋コロン。例: 太郎：おはよう / 太郎: おはよう
  static final RegExp _colonForm =
      RegExp(r'^[\s　]*([^\s　「『（(）)：:]{1,10})[\s　]*[：:][\s　]*(.+)$');

  /// カッコのみで完結する行＝ト書き。例:（ため息をつく）
  static final RegExp _fullParen = RegExp(r'^[\s　]*[（(].*[)）][\s　]*$');

  /// 柱・見出し。例: ○駅前・朝 / 第2場
  static final RegExp _pillar = RegExp(
      r'^[\s　]*(?:[○◯●◎□■△▲☆★×※]|第[0-9０-９一二三四五六七八九十]+[場幕景])');

  /// ページ番号だけの行。例: 12 / - 3 -
  static final RegExp _pageNumber =
      RegExp(r'^[\s　]*[-‐–—―ー]?[\s　]*[0-9０-９]{1,4}[\s　]*[-‐–—―ー]?[\s　]*$');

  /// 「登場人物」見出し。
  static final RegExp _castHeader =
      RegExp(r'^[\s　]*(登場人物|配役|キャスト)[:：]?[\s　]*$');

  ParsedScript parse(String raw) {
    final rawLines =
        raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');

    // ---- パス1: 役名辞書を作る ----
    final characters = <String>[];
    final dict = <String>{};
    void addName(String name) {
      final n = _cleanName(name);
      if (n.isNotEmpty && dict.add(n)) characters.add(n);
    }

    final colonCounts = <String, int>{};
    var inCast = false;
    for (final rawLine in rawLines) {
      final t = rawLine.trim();
      if (t.isEmpty) {
        inCast = false;
        continue;
      }
      if (_castHeader.hasMatch(t)) {
        inCast = true;
        continue;
      }
      if (inCast) {
        if (t.length <= 12 && !_bracketForm.hasMatch(t) && !_pillar.hasMatch(t)) {
          addName(t);
          continue;
        }
        inCast = false;
      }
      final b = _bracketForm.firstMatch(t);
      if (b != null) {
        addName(b.group(1)!); // カギカッコ形式は高信頼
        continue;
      }
      final c = _colonForm.firstMatch(t);
      if (c != null && !_pageNumber.hasMatch(c.group(1)!)) {
        final name = _cleanName(c.group(1)!);
        colonCounts[name] = (colonCounts[name] ?? 0) + 1;
      }
    }
    // コロン形式は同じ名前が2回以上現れたら役名とみなす（「場所：公園」等の見出しを除外）。
    colonCounts.forEach((name, count) {
      if (count >= 2) addName(name);
    });
    // 役名情報が皆無（登場人物もカギカッコも無い、コロンだけの台本）なら、
    // コロン形式の名前をすべて役名として採用する。
    if (dict.isEmpty) {
      colonCounts.keys.forEach(addName);
    }

    // ---- パス2: 行を分類する ----
    final lines = <Line>[];
    var counter = 0;
    String nextId() => 'l${counter++}';

    Line? openDialogue; // 「が閉じていないセリフ
    String closeChar = '」';
    String? blockSpeaker; // 役名単独行のあとのセリフブロック（戯曲形式）
    Line? blockLine;
    Line? proseDirection; // 直前の地の文ト書き（折返しの連結用）
    inCast = false;

    void closeBlock() {
      blockSpeaker = null;
      blockLine = null;
    }

    for (final rawLine in rawLines) {
      final t = rawLine.trim();

      // 空行：未クローズのセリフ・戯曲ブロック・登場人物ブロック・ト書き連結を閉じる。
      if (t.isEmpty) {
        openDialogue = null;
        inCast = false;
        closeBlock();
        proseDirection = null;
        continue;
      }
      // ページ番号は無視。
      if (_pageNumber.hasMatch(t)) continue;

      // 閉じていない「…」の続き（唯一の複数行連結）。
      if (openDialogue != null) {
        if (_bracketForm.hasMatch(t) || _castHeader.hasMatch(t)) {
          openDialogue = null; // 安全弁：新しい構造が始まったら強制クローズ
        } else {
          final closed = t.contains(closeChar);
          final body = closed ? t.substring(0, t.indexOf(closeChar)) : t;
          openDialogue.text = '${openDialogue.text}${body.trim()}';
          if (closed) openDialogue = null;
          continue;
        }
      }

      // 登場人物ブロック（行自体は出力しない）。
      if (_castHeader.hasMatch(t)) {
        inCast = true;
        closeBlock();
        continue;
      }
      if (inCast) {
        if (t.length <= 12 && !_bracketForm.hasMatch(t) && !_pillar.hasMatch(t)) {
          continue; // 役名は パス1 で登録済み
        }
        inCast = false;
      }

      // 戯曲形式ブロック中：構造行が来るまで同じ話者のセリフとして連結。
      if (blockSpeaker != null) {
        final isStructural = dict.contains(t) ||
            _bracketForm.hasMatch(t) ||
            _pillar.hasMatch(t) ||
            _fullParen.hasMatch(t) ||
            (_colonForm.firstMatch(t) != null &&
                dict.contains(_cleanName(_colonForm.firstMatch(t)!.group(1)!)));
        if (!isStructural) {
          final bl = blockLine;
          if (bl == null) {
            final line = Line(
                id: nextId(),
                type: LineType.dialogue,
                speaker: blockSpeaker,
                text: t);
            blockLine = line;
            lines.add(line);
          } else {
            bl.text = '${bl.text}$t';
          }
          continue;
        }
        closeBlock(); // 構造行 → ブロック終了して通常判定へ
      }

      // ここから通常判定。地の文ト書きの連結は「直前も地の文」の場合だけ。
      final prevProse = proseDirection;
      proseDirection = null;

      // 柱・見出し → ト書き。
      if (_pillar.hasMatch(t)) {
        lines.add(Line(id: nextId(), type: LineType.direction, text: t));
        continue;
      }
      // カッコで完結 → ト書き。
      if (_fullParen.hasMatch(t)) {
        lines.add(
            Line(id: nextId(), type: LineType.direction, text: _stripParens(t)));
        continue;
      }

      // 役名「セリフ」。
      final b = _bracketForm.firstMatch(t);
      if (b != null) {
        final speaker = _cleanName(b.group(1)!);
        addName(speaker);
        closeChar = b.group(2) == '『' ? '』' : '」';
        var body = b.group(3)!;
        final closed = body.contains(closeChar);
        if (closed) body = body.substring(0, body.indexOf(closeChar));
        final line = Line(
            id: nextId(),
            type: LineType.dialogue,
            speaker: speaker,
            text: body.trim());
        lines.add(line);
        if (!closed) openDialogue = line;
        continue;
      }

      // 役名：セリフ（辞書照合）。
      final c = _colonForm.firstMatch(t);
      if (c != null) {
        final name = _cleanName(c.group(1)!);
        if (dict.contains(name)) {
          lines.add(Line(
              id: nextId(),
              type: LineType.dialogue,
              speaker: name,
              text: c.group(2)!.trim()));
          continue;
        }
        // 辞書に無い名前のコロン行（場所：公園 等）→ ト書き。
        lines.add(Line(id: nextId(), type: LineType.direction, text: t));
        continue;
      }

      // 辞書にある役名だけの行 → 戯曲形式（次の行からセリフ）。
      if (dict.contains(t)) {
        blockSpeaker = t;
        blockLine = null;
        continue;
      }

      // 字下げ行・その他の地の文 → ト書き（前のセリフには連結しない）。
      // ト書きは複数行に折り返されることが多いため、直前も地の文なら1つに連結する。
      if (prevProse != null) {
        prevProse.text = '${prevProse.text}$t';
        proseDirection = prevProse;
      } else {
        final line = Line(id: nextId(), type: LineType.direction, text: t);
        lines.add(line);
        proseDirection = line;
      }
    }

    return ParsedScript(characters: characters, lines: lines);
  }

  String _cleanName(String s) =>
      s.replaceAll(RegExp(r'[（(].*[)）]'), '').trim();

  String _stripParens(String s) {
    final t = s.trim();
    return t
        .replaceFirst(RegExp(r'^[（(]'), '')
        .replaceFirst(RegExp(r'[)）]$'), '')
        .trim();
  }
}
