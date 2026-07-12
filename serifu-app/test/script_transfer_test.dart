import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/data/script_transfer.dart';
import 'package:serifu_app/models/script.dart';

void main() {
  Script sample() => Script(
        id: 'orig-1',
        title: '海辺の別れ',
        characters: ['アオイ', 'レン'],
        lines: [
          Line(id: 'l1', type: LineType.direction, text: '夕暮れの砂浜。'),
          Line(id: 'l2', type: LineType.dialogue, speaker: 'アオイ', text: '来てくれたんだ。'),
          Line(id: 'l3', type: LineType.dialogue, speaker: 'レン', text: '（頷いて）約束だからね。'),
        ],
        importedAt: DateTime(2026, 7, 1),
        lastPracticedAt: DateTime(2026, 7, 10),
        myCharacter: 'アオイ',
        readDirections: false,
        voiceByCharacter: {'レン': VoiceProfile(gender: Gender.male, rate: 1.5)},
      );

  test('書き出し→読み込みで内容が保持される（役・声設定・ト書き設定も）', () {
    final restored = ScriptTransfer.decode(ScriptTransfer.encode(sample()));
    expect(restored.title, '海辺の別れ');
    expect(restored.characters, ['アオイ', 'レン']);
    expect(restored.lines, hasLength(3));
    expect(restored.lines[2].speaker, 'レン');
    expect(restored.lines[2].text, '（頷いて）約束だからね。');
    expect(restored.myCharacter, 'アオイ');
    expect(restored.readDirections, isFalse);
    expect(restored.voiceByCharacter['レン']?.gender, Gender.male);
    expect(restored.voiceByCharacter['レン']?.rate, 1.5);
  });

  test('読み込み時はIDを新規採番し、練習履歴は引き継がない', () {
    final restored = ScriptTransfer.decode(ScriptTransfer.encode(sample()));
    expect(restored.id, isNot('orig-1'));
    expect(restored.lastPracticedAt, isNull);
  });

  test('不正な内容は FormatException（種類が分かるメッセージ付き）', () {
    expect(() => ScriptTransfer.decode('not json'), throwsFormatException);
    expect(() => ScriptTransfer.decode('{"format":"other"}'), throwsFormatException);
    expect(
      () => ScriptTransfer.decode('{"format":"honyomi-script","version":99,"script":{}}'),
      throwsFormatException,
    );
    expect(
      () => ScriptTransfer.decode('{"format":"honyomi-script","version":1}'),
      throwsFormatException,
    );
    // 行ゼロの台本は拒否。
    expect(
      () => ScriptTransfer.decode(
          '{"format":"honyomi-script","version":1,"script":{"id":"x","title":"t","characters":[],"lines":[],"importedAt":"2026-01-01T00:00:00.000"}}'),
      throwsFormatException,
    );
  });

  test('ファイル名はタイトルから安全に生成される', () {
    final s = sample();
    expect(ScriptTransfer.fileNameFor(s), '海辺の別れ.honyomi');
    s.title = 'a/b\\c:d*e?"f<g>h|i';
    expect(ScriptTransfer.fileNameFor(s), contains('_'));
    expect(ScriptTransfer.fileNameFor(s), isNot(contains('/')));
    s.title = '   ';
    expect(ScriptTransfer.fileNameFor(s), 'script.honyomi');
  });
}
