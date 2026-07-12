import 'dart:math' as math;

/// 認識テキストと「言うべきセリフ」の照合器（純Dart・テスト可能）。
///
/// ハンズフリー進行の精度は、音声認識そのものの精度よりも
/// 「期待するセリフとどれだけ一致したか」で判定する方が上がる：
/// - 語尾が一致 → 言い終わったと判断して**部分結果でも即**進む（応答が速い）
/// - 被覆率が高い → 進む
/// - 雑音・無関係な発話 → 進まない（誤進行を防ぐ）
///
/// 日本語の表記ゆれ（カタカナ/ひらがな、全角/半角、句読点、伸ばし棒）は
/// [normalize] で吸収し、文字バイグラムの被覆率で比較する。
/// 漢字の表記差（珈琲/コーヒー等）は完全には吸収できないが、
/// セリフ全体のバイグラムで見るため実用上は十分一致する。
class LineMatcher {
  LineMatcher({
    this.partialCoverageThreshold = 0.7,
    this.finalCoverageThreshold = 0.4,
    this.tailLength = 6,
  });

  /// 部分結果（発話中）でも進んでよい被覆率。
  final double partialCoverageThreshold;

  /// 確定結果で進んでよい被覆率。
  final double finalCoverageThreshold;

  /// 「言い終わり」とみなす語尾一致の文字数。
  final int tailLength;

  static const _ignore = {
    '、', '。', '，', '．', ',', '.', '!', '?', '！', '？', '…', '‥',
    '「', '」', '『', '』', '（', '）', '(', ')', '・', '〜', '~',
    '"', "'", '※', ':', ';', '：', '；', '－', '—', 'ー',
  };

  /// 表記ゆれの正規化：
  /// 全角英数→半角、カタカナ→ひらがな、小文字化、空白・句読点・伸ばし棒を除去。
  static String normalize(String input) {
    final buf = StringBuffer();
    for (var c in input.runes) {
      if (c >= 0xFF01 && c <= 0xFF5E) c -= 0xFEE0; // 全角英数記号 → 半角
      if (c >= 0x30A1 && c <= 0x30F6) c -= 0x60; // カタカナ → ひらがな
      final ch = String.fromCharCode(c).toLowerCase();
      if (_ignore.contains(ch) || ch.trim().isEmpty) continue;
      buf.write(ch);
    }
    return buf.toString();
  }

  static Set<String> _bigrams(String s) {
    if (s.isEmpty) return const {};
    if (s.length < 2) return {s};
    return {for (var i = 0; i < s.length - 1; i++) s.substring(i, i + 2)};
  }

  /// 期待セリフのバイグラムのうち、認識テキストに現れた割合（0.0〜1.0）。
  double coverage(String expected, String recognized) {
    final e = _bigrams(normalize(expected));
    if (e.isEmpty) return 0;
    final r = _bigrams(normalize(recognized));
    return e.intersection(r).length / e.length;
  }

  /// 次の行へ進んでよいか。
  /// [isFinal] は音声認識の確定結果かどうか（false=発話中の部分結果）。
  bool shouldAdvance({
    required String expected,
    required String recognized,
    required bool isFinal,
  }) {
    final ne = normalize(expected);
    final nr = normalize(recognized);
    if (nr.isEmpty) return false;
    // 照合対象が無い（想定外）場合は従来どおり確定で進む。
    if (ne.isEmpty) return isFinal;

    // 語尾一致 → 言い終わりとみなし、部分結果でも即進む。
    // 認識が末尾に助詞や相づちを付けても拾えるよう contains で許容する。
    final tail = ne.substring(ne.length - math.min(tailLength, ne.length));
    if (nr.contains(tail)) return true;

    // 「〜の？」「〜だよね。」など疑問形・言い切りは、終助詞が認識で
    // 落ちたり別表記になったりしやすい。終助詞を除いた語尾でも
    // 言い終わりとみなす（短すぎる語尾は誤進行を避けるため使わない）。
    final coreNe = _stripFinalParticles(ne);
    if (coreNe.length >= 3 && coreNe.length < ne.length) {
      final coreTail =
          coreNe.substring(coreNe.length - math.min(tailLength, coreNe.length));
      if (_stripFinalParticles(nr).contains(coreTail)) return true;
    }

    final cov = coverage(expected, recognized);
    // 長ゼリフは部分結果の被覆率だけで進むと「言い切る前に相手が被る」ため、
    // 文が長いほど部分進行の要求を上げる（30文字以上は9割）。
    final partialThr =
        ne.length >= longLineChars ? longLinePartialThreshold : partialCoverageThreshold;
    if (cov >= partialThr) return true; // だいたい言えている
    return isFinal && cov >= finalCoverageThreshold; // 確定なら大まかな一致で可
  }

  /// これ以上の長さ（正規化後）のセリフは部分進行の閾値を引き上げる。
  static const longLineChars = 30;
  static const longLinePartialThreshold = 0.9;

  static const _finalParticles = {'か', 'の', 'ね', 'よ', 'な', 'わ', 'さ', 'ぞ', 'ぜ'};

  /// 末尾の終助詞（最大2文字）を取り除く。
  static String _stripFinalParticles(String s) {
    var t = s;
    for (var i = 0; i < 2 && t.isNotEmpty; i++) {
      if (!_finalParticles.contains(t[t.length - 1])) break;
      t = t.substring(0, t.length - 1);
    }
    return t;
  }
}
