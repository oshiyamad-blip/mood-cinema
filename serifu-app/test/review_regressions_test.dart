// コードレビューで指摘された取り込み（解析・PDF行復元・文字化け判定）の退行テスト。
import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/parser/rule_based_parser.dart';
import 'package:serifu_app/services/pdf_layout_text.dart';
import 'package:serifu_app/services/text_extractor.dart';

GlyphRun ch(double x, double y, String t) =>
    GlyphRun(x: x, y: y, width: 13, height: 13, text: t);
GlyphRun run(double x, double y, String t) =>
    GlyphRun(x: x, y: y, width: 14.0 * t.length, height: 14, text: t);

/// 縦書き1列を「先頭 [head] → [gapCells] セル空け → 残り [tail]」で並べる。
List<GlyphRun> vcol(double x, String head, int gapCells, String tail) => [
      for (var i = 0; i < head.length; i++) ch(x, 60 + i * 14.2, head[i]),
      for (var i = 0; i < tail.length; i++)
        ch(x, 60 + (head.length + gapCells + i) * 14.2, tail[i]),
    ];

List<String> nonEmpty(String s) =>
    s.split('\n').where((l) => l.trim().isNotEmpty).toList();

void main() {
  group('解析：人物表のあとの表紙判定', () {
    test('人物表の直後がコロン形式のセリフなら、柱が後にあってもセリフをメタにしない', () {
      final r = RuleBasedParser().parse('＜登場人物＞\n'
          '太郎　高校生\n'
          '花子　姉\n'
          '\n'
          '太郎：ただいま\n'
          '花子：おかえり\n'
          '太郎：今日は早いね\n'
          '花子：まあね\n'
          '○公園\n'
          '太郎：行こう\n');
      final d = r.lines.where((l) => l.type == LineType.dialogue).toList();
      expect(d.first.text, 'ただいま');
      expect(d, hasLength(5));
    });

    test('人物表の直後が戯曲形式（役名だけの行）でもセリフをメタにしない', () {
      final r = RuleBasedParser().parse('【登場人物】\n'
          '太郎\n'
          '花子\n'
          '\n'
          '太郎\n'
          '　ただいま。\n'
          '花子\n'
          '　おかえり。\n'
          '○公園\n'
          '太郎\n'
          '　行こう。\n');
      final d = r.lines.where((l) => l.type == LineType.dialogue).toList();
      expect(d.map((l) => l.text), ['ただいま。', 'おかえり。', '行こう。']);
    });
  });

  group('PDF行復元：段組の誤分割を防ぐ', () {
    test('縦書き「役名␣␣セリフ」形式は段に分けず、役名とセリフを同じ行に保つ', () {
      final page = [
        ...vcol(700, '太郎', 2, 'おはよう花子'),
        ...vcol(678, '花子', 2, 'おはよう太郎くん'),
        ...vcol(656, '太郎', 2, '今日はいい天気だね'),
        ...vcol(634, '花子', 2, 'ほんとうにそうね'),
      ];
      final lines = nonEmpty(PdfLayoutText.reconstruct([page]));
      expect(lines, [
        '太郎　おはよう花子',
        '花子　おはよう太郎くん',
        '太郎　今日はいい天気だね',
        '花子　ほんとうにそうね',
      ]);
    });

    test('横書き：短いセリフばかりのページで中央の見出しが末尾へ移動しない', () {
      final page = [
        run(50, 60, '太郎「行くぞ」'),
        run(50, 80, '花子「うん」'),
        run(260, 110, '第二場'), // 中央寄せの見出し
        run(50, 140, '太郎「着いた」'),
        run(50, 160, '花子「やっと」'),
      ];
      final lines = nonEmpty(PdfLayoutText.reconstruct([page]));
      expect(lines, [
        '太郎「行くぞ」',
        '花子「うん」',
        '第二場',
        '太郎「着いた」',
        '花子「やっと」',
      ]);
    });

    test('横書き：タブ揃えの「役名　セリフ」を名前列とセリフ列に分けない', () {
      final page = [
        for (var i = 0; i < 6; i++) ...[
          run(50, 60.0 + i * 20, i.isEven ? '太郎' : '花子'),
          run(120, 60.0 + i * 20, i.isEven ? 'おはよう、元気？' : 'うん、元気だよ'),
        ],
      ];
      final lines = nonEmpty(PdfLayoutText.reconstruct([page]));
      expect(lines.first, '太郎　おはよう、元気？'); // 列に分かれず、区切りの空白も残る
      expect(lines[1], '花子　うん、元気だよ');
      expect(lines, hasLength(6));
    });
  });

  group('文字化け判定：日本語以外の正しい台本を化けと誤判定しない', () {
    const samples = {
      '韓国語': '철수: 안녕하세요, 오늘 날씨가 정말 좋네요. 영희: 네, 산책하기 딱 좋은 날이에요. 같이 갈래요?',
      'ロシア語': 'Иван: Доброе утро! Как ты спала? Мария: Спасибо, хорошо. А ты почему так рано встал сегодня?',
      'ギリシャ語': 'Νίκος: Καλημέρα! Τι κάνεις σήμερα; Μαρία: Καλά, ευχαριστώ. Πάμε μια βόλτα στην παραλία;',
      '中国語': '小明：你好，今天天气真好。小红：是啊，我们一起去公园散步吧。小明：好的，走吧。',
      'フランス語': 'Élodie : Où es-tu allé hier soir ? Théo : Au café près de la gare, c’était très sympa.',
      '記号の多い日本語': '※注意★♪■□◆◇→←↑↓○●◎△▲▽▼①②③ 太郎「えっ、本当に？」花子「うん（笑）」※次の場面へ',
    };
    samples.forEach((name, text) {
      test(name, () => expect(TextExtractor.looksGarbled(text), isFalse));
    });

    test('ToUnicode欠落PDF由来の化けは引き続き検出する', () {
      const garbled = 'ώϊΩ εɹΪ ͋ồỏΘ͔Μͳ͔ỳͨỐ͜͏͍͏ͱ͜Ͱձ͏ͱ '
          'ઌੜ΋ͳΜ͔ҧ͏͡ײỐനҥணͯͳ͍ͱී௨ͷਓΈ͍ͨ ੜ·Ε΋ҭͪ΋Ố';
      expect(TextExtractor.looksGarbled(garbled), isTrue);
    });

    test('私用領域（PUA）だらけの抽出結果は化けとみなす', () {
      final pua = String.fromCharCodes(List.generate(40, (i) => 0xE000 + i * 7));
      expect(TextExtractor.looksGarbled(pua), isTrue);
    });
  });
}
