import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/rehearsal/memorize_mask.dart';

void main() {
  test('文字は●に、句読点・記号・空白はそのまま残す（リズムの手がかり）', () {
    expect(maskLine('ごめん、待った？'), '●●●、●●●？');
    expect(maskLine('そっか。……おめでとう。'), '●●●。……●●●●●。');
    expect(maskLine('（笑って）それ、褒めてる？'), '（●●●）●●、●●●●？');
  });

  test('頭文字ヒント：最初の文字だけ見せる', () {
    expect(maskLine('ごめん、待った？', revealFirst: true), 'ご●●、●●●？');
    // 先頭が記号なら、その後の最初の文字を見せる。
    expect(maskLine('（間）ごめん', revealFirst: true), '（●）ご●●');
  });

  test('空文字・記号だけでも落ちない', () {
    expect(maskLine(''), '');
    expect(maskLine('……', revealFirst: true), '……');
  });
}
