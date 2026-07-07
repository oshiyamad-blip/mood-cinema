// 総合テスト：台本テキスト → 解析 → リハーサル進行 の一連の流れを
// 実物どおりのパイプラインで検証する（TTSはフェイク）。

import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/parser/rule_based_parser.dart';
import 'package:serifu_app/rehearsal/rehearsal_controller.dart';

class RecordingSpeaker implements RehearsalLineSpeaker {
  final spoken = <String>[]; // 「話者|本文」の並び
  @override
  Future<void> speakLine(Line line) async {
    spoken.add('${line.speaker ?? 'ト書き'}|${line.text}');
  }

  @override
  Future<void> stop() async {}
}

const _script = '''
入道雲（仮）
作：山田太郎

登場人物表
苗山菜々子（２８）　民宿で働く
佐々田春一（３２）　カメラマン

〇スーパー・レジ（夕）
　夕方。仕事帰りの客で賑わっている。
菜々子「お願いします」
春一「どうも。……あれ？」
　春一、菜々子の顔をじっと見る。
菜々子「な、なんですか」
春一「いや、失礼しました」
''';

void main() {
  final parser = RuleBasedParser();

  test('取り込み→解析→稽古モード：表紙/人物表は読まれず、自分の番で止まる', () async {
    final parsed = parser.parse(_script);

    // 役一覧はセリフのある2名だけ。
    expect(parsed.characters, ['菜々子', '春一']);

    final sp = RecordingSpeaker();
    final c = RehearsalController(
      lines: parsed.lines,
      myCharacter: '菜々子',
      readDirections: true,
      speaker: sp,
      directionPause: Duration.zero,
    );

    await c.run();
    // 表紙・人物表（メタ）は飛ばし、冒頭の柱とト書きを読んで自分の番で停止。
    expect(c.phase, RehearsalPhase.waitingForUser);
    expect(sp.spoken, [
      'ト書き|〇スーパー・レジ（夕）',
      'ト書き|夕方。仕事帰りの客で賑わっている。',
    ]);
    expect(c.currentLine!.text, 'お願いします');

    // 自分のセリフを言えた → 相手（春一）が返す → ト書き → 再び自分の番。
    await c.advanceMine();
    expect(c.phase, RehearsalPhase.waitingForUser);
    expect(sp.spoken.last, 'ト書き|春一、菜々子の顔をじっと見る。');
    expect(c.currentLine!.text, 'な、なんですか');

    // 最後まで。
    await c.advanceMine();
    expect(c.phase, RehearsalPhase.finished);
    expect(sp.spoken.last, '春一|いや、失礼しました');
  });

  test('聞き流しモード：全文（自分のセリフ含む）が順番どおり読まれる', () async {
    final parsed = parser.parse(_script);
    final sp = RecordingSpeaker();
    final c = RehearsalController(
      lines: parsed.lines,
      myCharacter: '菜々子',
      readDirections: true,
      speaker: sp,
      listenMode: true,
      directionPause: Duration.zero,
    );

    await c.run();
    expect(c.phase, RehearsalPhase.finished);
    // セリフ4行＋ト書き3行 = 7行すべて読まれる（メタは読まれない）。
    expect(sp.spoken.length, 7);
    expect(sp.spoken.where((s) => s.startsWith('菜々子|')).length, 2);
  });

  test('聞き流し×ト書きOFF：セリフだけが読まれる', () async {
    final parsed = parser.parse(_script);
    final sp = RecordingSpeaker();
    final c = RehearsalController(
      lines: parsed.lines,
      myCharacter: '菜々子',
      readDirections: false,
      speaker: sp,
      listenMode: true,
      directionPause: Duration.zero,
    );

    await c.run();
    expect(c.phase, RehearsalPhase.finished);
    expect(sp.spoken, [
      '菜々子|お願いします',
      '春一|どうも。……あれ？',
      '菜々子|な、なんですか',
      '春一|いや、失礼しました',
    ]);
  });

  test('クイック調整：練習の途中でト書きOFFに切り替えると以降は読まれない', () async {
    final parsed = parser.parse(_script);
    final sp = RecordingSpeaker();
    final c = RehearsalController(
      lines: parsed.lines,
      myCharacter: '菜々子',
      readDirections: true,
      speaker: sp,
      directionPause: Duration.zero,
    );

    await c.run(); // 冒頭ト書き2行は読まれる → 自分の番
    expect(sp.spoken.length, 2);

    c.readDirections = false; // クイック調整でOFF
    await c.advanceMine();
    // 春一のセリフは読むが、続くト書きは読まれない。
    expect(sp.spoken.last, '春一|どうも。……あれ？');
    expect(sp.spoken.where((s) => s.startsWith('ト書き|')).length, 2);
  });
}
