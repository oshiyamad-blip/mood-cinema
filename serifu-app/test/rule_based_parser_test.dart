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
}
