import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/parser/rule_based_parser.dart';

void main() {
  final parser = RuleBasedParser();

  test('カギカッコ書式のセリフを話者と本文に分解する', () {
    final r = parser.parse('太郎「おはよう」\n花子「おはよう、太郎くん」');
    expect(r.characters, containsAll(['太郎', '花子']));
    expect(r.lines.length, 2);
    expect(r.lines[0].type, LineType.dialogue);
    expect(r.lines[0].speaker, '太郎');
    expect(r.lines[0].text, 'おはよう');
    expect(r.lines[1].speaker, '花子');
    expect(r.lines[1].text, 'おはよう、太郎くん');
  });

  test('コロン書式（全角/半角）に対応する', () {
    final r = parser.parse('太郎：行こう\n花子:待って');
    expect(r.lines[0].speaker, '太郎');
    expect(r.lines[0].text, '行こう');
    expect(r.lines[1].speaker, '花子');
    expect(r.lines[1].text, '待って');
  });

  test('カッコ書きのト書きを direction として扱う', () {
    final r = parser.parse('（ドアが開く）\n太郎「誰だ」');
    expect(r.lines[0].type, LineType.direction);
    expect(r.lines[0].speaker, isNull);
    expect(r.lines[0].text, 'ドアが開く');
    expect(r.lines[1].type, LineType.dialogue);
  });

  test('セリフの継続行を直前のセリフへ連結する', () {
    final r = parser.parse('太郎「今日はいい天気だ。\nどこかへ出かけようか」');
    expect(r.lines.length, 1);
    expect(r.lines[0].speaker, '太郎');
    expect(r.lines[0].text, contains('出かけよう'));
  });

  test('登場人物ブロックから役名辞書を拾う', () {
    final r = parser.parse('登場人物\n太郎\n花子\n\n太郎「やあ」');
    expect(r.characters, containsAll(['太郎', '花子']));
  });

  group('行単位判定（1行にセリフとト書きは同居しない）', () {
    test('セリフ直後の地の文はト書きになる（前のセリフに丸呑みされない）', () {
      final r = parser.parse('太郎「おはよう」\n太郎は駅へ歩き出す。');
      expect(r.lines.length, 2);
      expect(r.lines[0].type, LineType.dialogue);
      expect(r.lines[0].text, 'おはよう');
      expect(r.lines[1].type, LineType.direction);
      expect(r.lines[1].text, '太郎は駅へ歩き出す。');
    });

    test('辞書に無い名前のコロン行（場所：公園 等）はト書き', () {
      final r = parser.parse('太郎「やあ」\n場所：公園\n時：昼');
      expect(r.lines[1].type, LineType.direction);
      expect(r.lines[2].type, LineType.direction);
      expect(r.characters, ['太郎']); // 場所・時 は役名にならない
    });

    test('柱（○駅前 等）・「第◯場」はト書き', () {
      final r = parser.parse('○駅前・朝\n第２場\n太郎「やあ」');
      expect(r.lines[0].type, LineType.direction);
      expect(r.lines[1].type, LineType.direction);
      expect(r.lines[2].type, LineType.dialogue);
    });

    test('字下げされた地の文はト書き', () {
      final r = parser.parse('太郎「やあ」\n　　二人は歩き出す。');
      expect(r.lines[1].type, LineType.direction);
      expect(r.lines[1].text, '二人は歩き出す。');
    });

    test('ページ番号だけの行は無視される', () {
      final r = parser.parse('太郎「A」\n- 12 -\n花子「B」');
      expect(r.lines.length, 2);
      expect(r.lines.every((l) => l.type == LineType.dialogue), isTrue);
    });

    test('折り返された複数行のト書きは1つに連結される', () {
      final r = parser.parse('太郎「やあ」\n'
          '　　太郎、立ち上がって窓辺へ歩き、\n'
          '　　外の雨をしばらく眺める。\n'
          '\n'
          '花子「どうしたの」');
      expect(r.lines.length, 3);
      expect(r.lines[1].type, LineType.direction);
      expect(r.lines[1].text, '太郎、立ち上がって窓辺へ歩き、外の雨をしばらく眺める。');
      expect(r.lines[2].speaker, '花子');
    });

    test('戯曲形式（役名だけの行＋次行からセリフ）に対応する', () {
      final r = parser.parse('登場人物\n太郎\n花子\n\n'
          '太郎\n　おはよう、花子。\n　今日はいい天気だね。\n'
          '花子\n　ほんとだね。');
      expect(r.lines.length, 2);
      expect(r.lines[0].speaker, '太郎');
      expect(r.lines[0].text, 'おはよう、花子。今日はいい天気だね。');
      expect(r.lines[1].speaker, '花子');
      expect(r.lines[1].text, 'ほんとだね。');
    });
  });
}
