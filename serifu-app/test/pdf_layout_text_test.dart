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

    test('縦書き2段組：上の段を読み切ってから下の段へ', () {
      // 上下2段（各段が右→左の縦書きブロック）。ページ全体で列を作ると
      // 同じxの上下の列が1本に合流してしまう。
      final page = [
        ...column(700, '上段の一行目です', startY: 60),
        ...column(678, '上段の二行目です', startY: 60),
        ...column(700, '下段の一行目です', startY: 300),
        ...column(678, '下段の二行目です', startY: 300),
      ]..shuffle();
      final text = PdfLayoutText.reconstruct([page]);
      final lines =
          text.split('\n').where((l) => l.trim().isNotEmpty).toList();
      expect(lines, ['上段の一行目です', '上段の二行目です', '下段の一行目です', '下段の二行目です']);
    });

    test('横書き2段組：左の段を読み切ってから右の段へ', () {
      // 左右2段の横書き（ワークショップ台本の本文ページに多い）。
      // ページ全体で行を作ると左右の段が同じ行に合流してしまう。
      final page = [
        run(30, 40, 'テーブルの椅子に座っているユウ。'),
        run(30, 57, 'ユウ「おはよう」'),
        run(300, 40, 'マコト「そうかもしれないけど」'),
        run(300, 57, 'ユウ「私に押し付けてただけじゃん」'),
      ]..shuffle();
      final text = PdfLayoutText.reconstruct([page]);
      final lines =
          text.split('\n').where((l) => l.trim().isNotEmpty).toList();
      expect(lines, [
        'テーブルの椅子に座っているユウ。',
        'ユウ「おはよう」',
        'マコト「そうかもしれないけど」',
        'ユウ「私に押し付けてただけじゃん」',
      ]);
    });

    test('横書き1段組：長い行が全幅を覆えば段に分割されない', () {
      final page = [
        run(30, 40, 'これはページの幅いっぱいまで届く長い一行の文章です。'),
        run(30, 57, '短い行'),
        run(200, 74, '字下げされた行'),
      ];
      final text = PdfLayoutText.reconstruct([page]);
      final lines =
          text.split('\n').where((l) => l.trim().isNotEmpty).toList();
      expect(lines, ['これはページの幅いっぱいまで届く長い一行の文章です。', '短い行', '字下げされた行']);
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

  test('縦書き：列内に文字セル1つ以上の空きがあれば全角空白を復元する', () {
    // 「ニコ␣␣ママと」を模す：役名2文字のあと約2セル空けてセリフが始まる。
    // 判定に足る他の列も置く（縦書き判定は10グリフ以上で有効になる）。
    final glyphs = [
      ...column(120, 'そうかもしれないよ'),
      ch(100, 87, 'ニ'),
      ch(100, 87 + 14.2, 'コ'),
      ch(100, 87 + 14.2 * 4, 'マ'),
      ch(100, 87 + 14.2 * 5, 'マ'),
      ch(100, 87 + 14.2 * 6, 'と'),
    ];
    final text = PdfLayoutText.reconstruct([glyphs]);
    final lines = text.trim().split('\n');
    expect(lines, contains('ニコ　ママと'));
  });
}
