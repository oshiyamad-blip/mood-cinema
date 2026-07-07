import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/services/pdf_layout_text.dart';

/// 全角1文字のグリフ（縦書き用）。x=列の位置、y=列内の位置。
GlyphRun ch(double x, double y, String text) =>
    GlyphRun(x: x, y: y, width: 13, height: 13, text: text);

/// 横書きのテキストラン。
GlyphRun run(double x, double y, String text) =>
    GlyphRun(x: x, y: y, width: 14.0 * text.length, height: 14, text: text);

/// 縦書きの1列（1行）をグリフに分解する。
List<GlyphRun> column(double x, String text, {double startY = 87}) => [
      for (var i = 0; i < text.length; i++)
        ch(x, startY + i * 14.2, text[i]),
    ];

void main() {
  group('PdfLayoutText.reconstruct', () {
    test('縦書き：列を右から左へ読み、列内は上から下', () {
      final page = [
        ...column(700, '〇駅前・朝'),
        ...column(678, '太郎、歩いてくる。'),
        ...column(656, '太郎「おはよう」'),
      ]..shuffle(); // 入力順に依存しないこと
      final text = PdfLayoutText.reconstruct([page]);
      final lines =
          text.split('\n').where((l) => l.trim().isNotEmpty).toList();
      expect(lines, ['〇駅前・朝', '太郎、歩いてくる。', '太郎「おはよう」']);
    });

    test('縦書き：列間が大きく空いたら空行（段落境界）が入る', () {
      final page = [
        ...column(700, '一行目です'),
        ...column(678, '二行目です'),
        ...column(656, '三行目です'),
        // 通常の列間隔は22pt。ここは66ptあける。
        ...column(590, '段落が変わった'),
        ...column(568, '五行目です'),
      ];
      final text = PdfLayoutText.reconstruct([page]);
      expect(text, contains('三行目です\n\n段落が変わった'));
    });

    test('横書き：行を上から下へ読み、行内は左から右', () {
      final page = [
        run(100, 50, '太郎「おはよう」'),
        run(100, 30, '○駅前・朝'),
      ];
      final text = PdfLayoutText.reconstruct([page]);
      final lines =
          text.split('\n').where((l) => l.trim().isNotEmpty).toList();
      expect(lines, ['○駅前・朝', '太郎「おはよう」']);
    });

    test('全ページ先頭で繰り返されるヘッダーは除去される（数字違いも同一視）', () {
      List<GlyphRun> pageWith(String header, String body) => [
            run(100, 20, header),
            ...column(700, body, startY: 60),
          ];
      final pages = [
        pageWith('応募用紙ヘッダー (30字×30行) 1', '一ページ目の本文がここにある'),
        pageWith('応募用紙ヘッダー (30字×30行) 2', '二ページ目の本文がここにある'),
        pageWith('応募用紙ヘッダー (30字×30行) 3', '三ページ目の本文がここにある'),
      ];
      final text = PdfLayoutText.reconstruct(pages);
      expect(text, isNot(contains('応募用紙ヘッダー')));
      expect(text, contains('一ページ目の本文がここにある'));
      expect(text, contains('三ページ目の本文がここにある'));
    });

    test('本文の短い行はページをまたいで同じでも消えない', () {
      List<GlyphRun> page(String first, List<String> bodies) => [
            ...column(700, first),
            for (var i = 0; i < bodies.length; i++)
              ...column(678 - i * 22.0, bodies[i]),
          ];
      final pages = [
        page('花子「はい」', ['太郎「よし」']),
        page('花子「はい」', ['太郎「次」']),
        page('花子「はい」', ['太郎「終」']),
      ];
      final text = PdfLayoutText.reconstruct(pages);
      // 「はい」のような短い行はページ端に繰り返されても定型とみなさない
      // （キー6文字以上の制限）。
      expect('はい'.allMatches(text).length, greaterThanOrEqualTo(3));
    });
  });
}
