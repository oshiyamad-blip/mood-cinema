import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/rehearsal/line_matcher.dart';

void main() {
  final m = LineMatcher();

  group('normalize', () {
    test('カタカナ→ひらがな・句読点や伸ばし棒の除去', () {
      expect(LineMatcher.normalize('オハヨウ、ゴザイマス！'), 'おはようございます');
      expect(LineMatcher.normalize('コーヒー を 飲む。'), 'こひを飲む');
    });

    test('全角英数→半角・小文字化・空白除去', () {
      expect(LineMatcher.normalize('ＡＢＣ　１２３'), 'abc123');
    });
  });

  group('coverage', () {
    test('完全一致は 1.0', () {
      expect(m.coverage('おはよう、花子', 'おはよう花子'), 1.0);
    });

    test('無関係な発話は低い', () {
      expect(m.coverage('今日はいい天気だね', 'えっとその'), lessThan(0.2));
    });

    test('期待が空なら 0', () {
      expect(m.coverage('', 'なにか'), 0);
    });
  });

  group('shouldAdvance', () {
    test('語尾一致なら部分結果でも即進む（言い終わり検知）', () {
      expect(
        m.shouldAdvance(expected: 'おはよう、花子', recognized: 'おはよう花子', isFinal: false),
        isTrue,
      );
    });

    test('セリフ後に余計な語尾がついても被覆率で進む', () {
      expect(
        m.shouldAdvance(
          expected: 'おはよう、花子',
          recognized: 'おはよう花子えー',
          isFinal: false,
        ),
        isTrue, // 被覆率 1.0 ≥ partial 閾値
      );
    });

    test('雑音・無関係な確定結果では進まない（誤進行の防止）', () {
      expect(
        m.shouldAdvance(
          expected: '今日はいいオーディション日和だね',
          recognized: 'えっと',
          isFinal: true,
        ),
        isFalse,
      );
    });

    test('多少の認識ミスがあっても確定なら過半一致で進む', () {
      // 語頭の「うん」を取りこぼした認識を想定。
      expect(
        m.shouldAdvance(
          expected: 'うん、オーディションがあるんだ',
          recognized: 'オーディションがある',
          isFinal: true,
        ),
        isTrue,
      );
      // 同じ内容でも部分結果の段階では進まない（言い終わりを待つ）。
      expect(
        m.shouldAdvance(
          expected: 'うん、オーディションがあるんだ',
          recognized: 'オーディションがある',
          isFinal: false,
        ),
        isFalse,
      );
    });

    test('短いセリフ（はい 等）も語尾一致で進む', () {
      expect(
        m.shouldAdvance(expected: 'はい', recognized: 'はい', isFinal: false),
        isTrue,
      );
    });

    test('大まかに合っていれば確定で進む（緩め判定）', () {
      // 助詞の取りこぼし・言い換えがあっても4割方合っていれば進む。
      expect(
        m.shouldAdvance(
          expected: 'ママとおじさんって全然似てないね',
          recognized: 'ママとおじさん全然似てない',
          isFinal: true,
        ),
        isTrue,
      );
    });

    test('末尾に相づき・助詞がついても語尾一致で進む', () {
      expect(
        m.shouldAdvance(
          expected: 'もう行かなくちゃ',
          recognized: 'もう行かなくちゃね',
          isFinal: false,
        ),
        isTrue,
      );
    });

    test('緩めても無関係な発話では進まない（誤進行の防止は維持）', () {
      expect(
        m.shouldAdvance(
          expected: '海の向こうに行きたいんだ',
          recognized: 'そうだね',
          isFinal: true,
        ),
        isFalse,
      );
    });

    test('「？」で終わるセリフ：終助詞が認識で落ちても語尾で進む', () {
      // 「〜の？」の「の」を認識が取りこぼした想定。
      expect(
        m.shouldAdvance(
          expected: 'どこへ行くの？',
          recognized: 'どこへ行く',
          isFinal: false,
        ),
        isTrue,
      );
      // 「〜かな？」→ 終助詞2文字が落ちた想定。
      expect(
        m.shouldAdvance(
          expected: '明日は晴れるかな？',
          recognized: '明日は晴れる',
          isFinal: false,
        ),
        isTrue,
      );
    });

    test('「。」で終わる言い切り：終助詞ゆれでも語尾で進む', () {
      expect(
        m.shouldAdvance(
          expected: 'もう寝るね。',
          recognized: 'もう寝る',
          isFinal: false,
        ),
        isTrue,
      );
    });

    test('終助詞を除いても無関係な発話では進まない（誤進行の防止）', () {
      expect(
        m.shouldAdvance(
          expected: '行くのか？',
          recognized: 'そうだね',
          isFinal: false,
        ),
        isFalse,
      );
    });

    test('認識が空なら進まない', () {
      expect(
        m.shouldAdvance(expected: 'おはよう', recognized: '', isFinal: true),
        isFalse,
      );
    });

    test('期待セリフが空なら確定で進む（従来動作）', () {
      expect(m.shouldAdvance(expected: '', recognized: 'なにか', isFinal: true), isTrue);
      expect(m.shouldAdvance(expected: '', recognized: 'なにか', isFinal: false), isFalse);
    });
  });
}
