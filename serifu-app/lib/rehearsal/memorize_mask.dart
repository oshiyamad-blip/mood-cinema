/// 暗記の段階サポート用の伏せ字（純Dart・テスト可能）。
///
/// 覚えかけの時期は「全部見える」と「全部隠す」の間が欲しい：
/// - 伏せ字: 文字だけを ● に置き換え、句読点・記号・空白は残す
///   （セリフの長さとリズムが手がかりになる）
/// - 頭文字: 先頭の1文字だけ見せる（思い出すきっかけを残す）
library;

/// 伏せ字にしない文字（リズムの手がかりとして残す）。
const _keepChars = {
  '、', '。', '，', '．', ',', '.', '!', '?', '！', '？', '…', '‥',
  '「', '」', '『', '』', '（', '）', '(', ')', '・', '〜', '~', 'ー',
  '—', '－', ' ', '　', '\n',
};

/// セリフを伏せ字にする。[revealFirst] なら最初の文字だけ見せる（頭文字ヒント）。
/// （）内は演技指示（声に出さない）なので、頭文字として明かさない。
String maskLine(String text, {bool revealFirst = false}) {
  final buf = StringBuffer();
  var revealed = !revealFirst;
  var parenDepth = 0;
  for (final ch in text.runes) {
    final c = String.fromCharCode(ch);
    if (c == '（' || c == '(') parenDepth++;
    if (_keepChars.contains(c)) {
      buf.write(c);
      if ((c == '）' || c == ')') && parenDepth > 0) parenDepth--;
      continue;
    }
    if (!revealed && parenDepth == 0) {
      buf.write(c);
      revealed = true;
    } else {
      buf.write('●');
    }
  }
  return buf.toString();
}
