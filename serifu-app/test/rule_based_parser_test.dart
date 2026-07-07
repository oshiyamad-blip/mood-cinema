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

  test('登場人物ブロックから役名辞書を拾う（発言のない名前は一覧に出さない）', () {
    final r = parser.parse('登場人物\n太郎\n花子\n\n太郎「やあ」\n花子「どうも」');
    expect(r.characters, containsAll(['太郎', '花子']));

    final r2 = parser.parse('登場人物\n太郎\n花子\n\n太郎「やあ」');
    expect(r2.characters, ['太郎']); // 花子は一度も話さない → 候補から除外
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
      final dialogue =
          r.lines.where((l) => l.type == LineType.dialogue).toList();
      expect(dialogue.length, 2);
      expect(dialogue[0].speaker, '太郎');
      expect(dialogue[0].text, 'おはよう、花子。今日はいい天気だね。');
      expect(dialogue[1].speaker, '花子');
      expect(dialogue[1].text, 'ほんとだね。');
    });
  });

  group('メタ情報（表紙・登場人物表）の除外', () {
    test('表紙（タイトル・クレジット・応募情報）はメタになる', () {
      final r = parser.parse('入道雲\n'
          '作：山田太郎\n'
          '氏名(ＰＮ)\n'
          '山田太郎\n'
          '\n'
          '○駅前・朝\n'
          '太郎「やあ」');
      expect(r.lines[0].type, LineType.meta);
      expect(r.lines[0].text, '入道雲');
      expect(r.lines[1].type, LineType.meta);
      expect(r.lines[2].type, LineType.meta);
      expect(r.lines[3].type, LineType.meta);
      expect(r.lines[4].type, LineType.direction); // ○駅前・朝
      expect(r.lines[5].type, LineType.dialogue);
    });

    test('表紙らしい項目語が無ければ冒頭のト書きを表紙扱いしない', () {
      final r = parser.parse('静かな夜。雨が降っている。\n\n太郎「まだ降ってるな」');
      expect(r.lines[0].type, LineType.direction);
      expect(r.lines[1].type, LineType.dialogue);
    });

    test('登場人物表（説明付き）はメタになり、名前だけ辞書に入る', () {
      final r = parser.parse('登場人物表\n'
          '田中一郎（２８）　売れない役者。主人公。\n'
          '佐藤花子(２６)　一郎の幼なじみ\n'
          '\n'
          '○公園・昼\n'
          '田中一郎「よお」\n'
          '佐藤花子「久しぶり」');
      expect(r.lines[0].type, LineType.meta); // 登場人物表
      expect(r.lines[1].type, LineType.meta);
      expect(r.lines[2].type, LineType.meta);
      expect(r.characters, containsAll(['田中一郎', '佐藤花子']));
      final dialogue =
          r.lines.where((l) => l.type == LineType.dialogue).toList();
      expect(dialogue.length, 2);
    });

    test('〇（漢数字ゼロ）で書かれた柱もト書きになる', () {
      final r = parser.parse('〇スーパー（夕）\n夕方六時すぎ。\n太郎「やあ」');
      expect(r.lines[0].type, LineType.direction);
      expect(r.lines[0].text, '〇スーパー（夕）');
      expect(r.lines[1].type, LineType.direction);
      expect(r.lines[1].text, '夕方六時すぎ。');
    });

    test('記号だけの飾り行はメタになる', () {
      final r = parser.parse('太郎「やあ」\n………………\n花子「どうも」');
      expect(r.lines[1].type, LineType.meta);
      expect(r.lines[0].type, LineType.dialogue);
      expect(r.lines[2].type, LineType.dialogue);
    });

    test('あらすじ内の「〜で、『…』」をセリフと誤検出しない', () {
      final r = parser.parse('太郎「やあ」\n'
          '街を案内する中で、「写真は残すためのものではない」という言葉に触れる。');
      expect(r.lines[1].type, LineType.direction);
      expect(r.characters, ['太郎']);
    });
  });
}
