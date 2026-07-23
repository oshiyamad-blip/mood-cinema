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
  /// 役名に句読点は含まれない（あらすじ等の「〜で、『…』」を誤検出しない）。
  static final RegExp _bracketForm =
      RegExp(r'^[\s　]*([^\s　「『（(）)：:、。，．]{1,10})[\s　]*([「『])(.*)$');

  /// 役名＋コロン。例: 太郎：おはよう / 太郎: おはよう
  static final RegExp _colonForm =
      RegExp(r'^[\s　]*([^\s　「『（(）)：:、。，．]{1,10})[\s　]*[：:][\s　]*(.+)$');

  /// 役名＋空白＋セリフ（カギ括弧なし）。例: ニコ　ママと似てないね。
  /// テレビ・映画台本の抜粋に多い形式。空白の前の短い語が本文中に
  /// 繰り返し現れる場合のみ役名とみなす（ト書きの誤検出を防ぐ）。
  static final RegExp _spaceForm = RegExp(
      r'^[\s　]*([^\s　「『（(）)：:、。，．！？!?]{1,6})[ 　]+(.{2,})$');

  /// カッコのみで完結する行＝ト書き。例:（ため息をつく）
  static final RegExp _fullParen = RegExp(r'^[\s　]*[（(].*[)）][\s　]*$');

  /// 柱・見出し。例: ○駅前・朝 / 〇スーパー（夕） / 第2場
  /// 「〇」（漢数字ゼロ）で書かれる台本も多い。
  static final RegExp _pillar = RegExp(
      r'^[\s　]*(?:[○◯〇●◎□■◾◼▪△▲☆★×※]|第[0-9０-９一二三四五六七八九十]+[場幕景])');

  /// 場面の柱として確度の高い形（※注記・★注意書きを含まない）。
  /// 表紙の終わり（本編の開始）を探すときに使う。
  static final RegExp _scenePillar = RegExp(
      r'^[\s　]*(?:[○◯〇●◎□■◾◼▪]|第[0-9０-９一二三四五六七八九十]+[場幕景])');

  /// 記号・罫線だけの飾り行（ページ区切りの点線など）→ メタ情報。
  static final RegExp _decoration =
      RegExp(r'^[\s　、。，．・･…‥：:；;―—–\-ー~〜＝=＊*※☆★○●◎□■◇◆△▲▽▼／/＼\\｜|]+$');

  /// ページ番号だけの行。例: 12 / - 3 -
  static final RegExp _pageNumber =
      RegExp(r'^[\s　]*[-‐–—―ー]?[\s　]*[0-9０-９]{1,4}[\s　]*[-‐–—―ー]?[\s　]*$');

  /// 「登場人物」見出し。飾り（点線など）付き・「登場人物表」・
  /// カッコ囲み（＜登場人物＞【登場人物】等）も許容。
  static final RegExp _castHeader = RegExp(
      r'^[\s　・．.…‥＊*―—－\-]*[＜〈【〔]?(登場人物|配役|キャスト)表?[＞〉】〕]?[:：]?[\s　]*$');

  /// 表紙のクレジット行。例: 作：山田太郎 / 脚本 山田太郎
  static final RegExp _credit = RegExp(
      r'^[\s　]*(作・演出|作|脚本|演出|原作|翻訳|潤色|構成|著)[\s　:：]');

  /// 表紙・応募用紙・あらすじページに現れる項目語。
  /// 表紙（フロントマター）判定のシグナルとして数える。
  static final RegExp _frontMatterWord = RegExp(
      r'応募|タイトル|題名|氏名|ペンネーム|ＰＮ|住所|年齢|電話|メール|原稿|'
      r'あらすじ|梗概|表紙|連絡先|字×|枚数');

  /// 表紙とみなす行数の上限（安全弁）。応募用紙＋あらすじページ程度を想定。
  static const _maxCoverLines = 150;

  /// 人物表の後ろに続く前書き（人物説明・※注記）を表紙に含めて探す行数。
  static const _castLookahead = 40;

  ParsedScript parse(String raw) {
    final rawLines =
        raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');

    // ---- パス0: 表紙（フロントマター）の範囲を決める ----
    //
    // 文書先頭から「本編の開始」までをメタ情報（読み上げ対象外）にする。
    // 本編の開始 = 登場人物見出し / 柱（〇… 第N場）/ 役名「セリフ」 /
    //              項目語でないコロン行（役名：セリフ 等）。
    // 確定条件：
    //   - 登場人物見出しで終わる先頭ブロックは**無条件で表紙**
    //     （人物表の前は台本の構造上すべて前付け。タイトルだけの表紙も拾う）
    //   - それ以外（柱・セリフで本編が始まる）は、区間内に表紙らしい項目語
    //     （タイトル・氏名・作：…・あらすじ等）が2つ以上あるときだけ表紙
    //     （表紙なしで冒頭からト書きが始まる台本を誤判定しないため）。
    var coverUntil = 0; // rawLines のこのインデックスより前が表紙
    {
      var keywordHits = 0;
      var scanned = 0;
      for (var i = 0; i < rawLines.length; i++) {
        final t = rawLines[i].trim();
        if (t.isEmpty || _pageNumber.hasMatch(t)) continue;
        if (_castHeader.hasMatch(t)) {
          if (i > 0) coverUntil = i;
          // 人物表で表紙が終わる台本では、人物の説明や※注記などの前書きが
          // 人物表のあとに続くことがある（ワークショップ審査台本など）。
          // 近くに柱（〇シーン等）があればそこまでを表紙に含める。
          // 柱が無い台本（人物表の直後に本文が始まる形）は従来どおり。
          for (var j = i + 1;
              j < rawLines.length && j <= i + _castLookahead;
              j++) {
            final u = rawLines[j].trim();
            if (u.isEmpty) continue;
            if (_bracketForm.hasMatch(u)) break; // セリフ開始 → 本編
            if (_scenePillar.hasMatch(u)) {
              coverUntil = j;
              break;
            }
          }
          break;
        }
        final isFrontMatter =
            _credit.hasMatch(t) || _frontMatterWord.hasMatch(t);
        final isStructural = !isFrontMatter &&
            (_pillar.hasMatch(t) ||
                _bracketForm.hasMatch(t) ||
                _colonForm.hasMatch(t));
        if (isStructural) {
          if (i > 0 && keywordHits >= 2) coverUntil = i;
          break;
        }
        if (isFrontMatter) keywordHits++;
        scanned++;
        if (scanned > _maxCoverLines) break; // 長すぎる → 表紙判定を諦める
      }
    }

    // ---- パス1: 役名辞書を作る ----
    final characters = <String>[];
    final dict = <String>{};
    void addName(String name) {
      final n = _cleanName(name);
      if (n.isNotEmpty && dict.add(n)) characters.add(n);
    }

    final colonCounts = <String, int>{};
    final spaceCounts = <String, int>{};
    var inCast = false;
    // 表紙拡張により人物表が表紙区間に入ることがあるため、
    // 人物表（見出し＋エントリ）だけは表紙区間でもスキャンする。
    for (var i = 0; i < rawLines.length; i++) {
      final t = rawLines[i].trim();
      if (t.isEmpty) {
        inCast = false;
        continue;
      }
      if (_castHeader.hasMatch(t)) {
        inCast = true;
        continue;
      }
      if (inCast) {
        // 人物表の1行（説明付きも可：「田中一郎（28）　主人公。」）から
        // 先頭の名前だけを登録する。空行または構造行までを人物表とみなす。
        if (!_bracketForm.hasMatch(t) && !_pillar.hasMatch(t)) {
          final name = _castEntryName(t);
          if (name != null) addName(name);
          continue;
        }
        inCast = false;
      }
      if (i < coverUntil) continue; // 表紙は人物表以外を数えない
      final b = _bracketForm.firstMatch(t);
      if (b != null) {
        addName(b.group(1)!); // カギカッコ形式は高信頼
        continue;
      }
      final c = _colonForm.firstMatch(t);
      if (c != null && !_pageNumber.hasMatch(c.group(1)!)) {
        final name = _cleanName(c.group(1)!);
        colonCounts[name] = (colonCounts[name] ?? 0) + 1;
        continue;
      }
      final sp = _spaceForm.firstMatch(t);
      if (sp != null) {
        final name = _cleanName(sp.group(1)!);
        if (name.isNotEmpty) {
          spaceCounts[name] = (spaceCounts[name] ?? 0) + 1;
        }
      }
    }
    // コロン形式は同じ名前が2回以上現れたら役名とみなす（「場所：公園」等の見出しを除外）。
    colonCounts.forEach((name, count) {
      if (count >= 2) addName(name);
    });
    // 空白区切り形式（カギ括弧なし）はより弱い証拠のため3回以上で役名とみなす
    // （ト書きの「二人　顔を見合わせる」のような偶発一致を除外）。
    spaceCounts.forEach((name, count) {
      if (count >= 3) addName(name);
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
    Line? wrapDialogue; // 直前の空白区切りセリフ（文末で終わっていない＝折返し中）
    inCast = false;

    void closeBlock() {
      blockSpeaker = null;
      blockLine = null;
    }

    for (var i = 0; i < rawLines.length; i++) {
      final t = rawLines[i].trim();

      // 表紙（フロントマター）→ メタ情報（読み上げ対象外・表示のみ）。
      if (i < coverUntil) {
        if (t.isNotEmpty && !_pageNumber.hasMatch(t)) {
          lines.add(Line(id: nextId(), type: LineType.meta, text: t));
        }
        continue;
      }

      // 空行：未クローズのセリフ・戯曲ブロック・登場人物ブロック・ト書き連結を閉じる。
      if (t.isEmpty) {
        openDialogue = null;
        inCast = false;
        closeBlock();
        proseDirection = null;
        wrapDialogue = null;
        continue;
      }
      // ページ番号は無視。
      if (_pageNumber.hasMatch(t)) continue;

      // 記号だけの飾り行 → メタ情報（段落区切りとして扱い、連結も切る）。
      if (openDialogue == null && _decoration.hasMatch(t)) {
        proseDirection = null;
        closeBlock();
        lines.add(Line(id: nextId(), type: LineType.meta, text: t));
        continue;
      }

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

      // 登場人物ブロック → メタ情報（読み上げ対象外・表示のみ）。
      // 役名の登録自体はパス1で済んでいる。
      if (_castHeader.hasMatch(t)) {
        inCast = true;
        closeBlock();
        proseDirection = null;
        lines.add(Line(id: nextId(), type: LineType.meta, text: t));
        continue;
      }
      if (inCast) {
        if (!_bracketForm.hasMatch(t) && !_pillar.hasMatch(t)) {
          lines.add(Line(id: nextId(), type: LineType.meta, text: t));
          continue;
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
                dict.contains(_cleanName(_colonForm.firstMatch(t)!.group(1)!))) ||
            (_spaceForm.firstMatch(t) != null &&
                dict.contains(_cleanName(_spaceForm.firstMatch(t)!.group(1)!)));
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
      final prevWrap = wrapDialogue;
      wrapDialogue = null;

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

      // 役名＋空白＋セリフ（辞書照合。カギ括弧なしのテレビ・映画台本形式）。
      final sp = _spaceForm.firstMatch(t);
      if (sp != null && dict.contains(_cleanName(sp.group(1)!))) {
        final line = Line(
            id: nextId(),
            type: LineType.dialogue,
            speaker: _cleanName(sp.group(1)!),
            text: sp.group(2)!.trim());
        lines.add(line);
        // 文末記号で終わっていなければ折返し（縦書きPDFの列またぎ）とみなし、
        // 次の地の文をこのセリフに連結できるようにする。
        if (!_endsSentence(line.text)) wrapDialogue = line;
        continue;
      }

      // 辞書にある役名だけの行 → 戯曲形式（次の行からセリフ）。
      if (dict.contains(t)) {
        blockSpeaker = t;
        blockLine = null;
        continue;
      }

      // 直前の空白区切りセリフが文の途中で切れている → 折返しの続きとして連結。
      if (prevWrap != null) {
        prevWrap.text = '${prevWrap.text}$t';
        if (!_endsSentence(prevWrap.text)) wrapDialogue = prevWrap;
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

    // 実際にセリフを話した役だけを一覧にする（人物表のフルネームなど、
    // 発言のない名前は役選択の候補から外す）。1人も話者がいなければ全員残す。
    final speakers =
        lines.where((l) => l.type == LineType.dialogue).map((l) => l.speaker).toSet();
    final speaking = characters.where(speakers.contains).toList();

    return ParsedScript(
        characters: speaking.isEmpty ? characters : speaking, lines: lines);
  }

  /// 文末記号で終わっているか（折返し判定用）。
  bool _endsSentence(String t) =>
      RegExp(r'[。．！？!?♪」』…‥）)]$').hasMatch(t.trim());

  String _cleanName(String s) =>
      s.replaceAll(RegExp(r'[（(].*[)）]'), '').trim();

  /// 人物表の1行から役名を取り出す。
  /// 例:「田中一郎（28）　売れない役者。主人公。」→「田中一郎」
  String? _castEntryName(String t) {
    final cleaned = _cleanName(t);
    final m = RegExp(r'^[^\s　、。，．・:：…‥「」『』]{1,10}').firstMatch(cleaned);
    final name = m?.group(0)?.trim();
    return (name == null || name.isEmpty) ? null : name;
  }

  String _stripParens(String s) {
    final t = s.trim();
    return t
        .replaceFirst(RegExp(r'^[（(]'), '')
        .replaceFirst(RegExp(r'[)）]$'), '')
        .trim();
  }
}
