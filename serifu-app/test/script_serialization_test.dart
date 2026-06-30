import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/data/script_store.dart';
import 'package:serifu_app/models/script.dart';

void main() {
  test('Script の JSON ラウンドトリップで内容が保持される', () {
    final original = Script(
      id: 's1',
      title: 'テスト台本',
      characters: ['太郎', '花子'],
      lines: [
        Line(id: 'l0', type: LineType.direction, text: '朝の駅'),
        Line(id: 'l1', type: LineType.dialogue, speaker: '太郎', text: 'おはよう'),
      ],
      importedAt: DateTime.parse('2026-06-30T09:00:00.000'),
      myCharacter: '太郎',
      readDirections: false,
      voiceByCharacter: {
        '花子': VoiceProfile(gender: Gender.female, rate: 1.5, pitch: 1.1),
      },
    );

    final restored = ScriptStore.decode(ScriptStore.encode([original])).single;

    expect(restored.id, 's1');
    expect(restored.title, 'テスト台本');
    expect(restored.characters, ['太郎', '花子']);
    expect(restored.lines.length, 2);
    expect(restored.lines[0].type, LineType.direction);
    expect(restored.lines[1].speaker, '太郎');
    expect(restored.myCharacter, '太郎');
    expect(restored.readDirections, false);
    expect(restored.voiceByCharacter['花子']!.gender, Gender.female);
    expect(restored.voiceByCharacter['花子']!.rate, 1.5);
    expect(restored.importedAt, DateTime.parse('2026-06-30T09:00:00.000'));
  });
}
