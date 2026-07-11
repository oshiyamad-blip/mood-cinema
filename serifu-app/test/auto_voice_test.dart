import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/speech/auto_voice.dart';
import 'package:serifu_app/speech/speech_engine.dart';

void main() {
  group('voiceQualityScore', () {
    test('拡張/プレミアム/networkは高く、compactは低い', () {
      expect(voiceQualityScore('com.apple.voice.premium.ja-JP.Kyoko'), 30);
      expect(voiceQualityScore('com.apple.voice.enhanced.ja-JP.Kyoko'), 20);
      expect(voiceQualityScore('ja-jp-x-jab-network'), 10);
      expect(voiceQualityScore('com.apple.voice.compact.ja-JP.Kyoko'), -10);
      expect(voiceQualityScore('ja-jp-x-jab-local'), 0);
    });
  });

  group('pickAutoVoice', () {
    TtsVoice v(String id, [Gender? g]) => TtsVoice(id: id, name: id, gender: g);

    test('性別が合う中で最も高音質を選ぶ', () {
      final picked = pickAutoVoice([
        v('com.apple.voice.compact.ja-JP.Kyoko', Gender.female),
        v('com.apple.voice.enhanced.ja-JP.Kyoko', Gender.female),
        v('com.apple.voice.premium.ja-JP.Otoya', Gender.male),
      ], Gender.female);
      expect(picked?.id, 'com.apple.voice.enhanced.ja-JP.Kyoko');
    });

    test('性別が合わないボイスは高音質でも選ばない', () {
      final picked = pickAutoVoice([
        v('com.apple.voice.premium.ja-JP.Otoya', Gender.male),
        v('com.apple.voice.compact.ja-JP.Kyoko', Gender.female),
      ], Gender.female);
      expect(picked?.id, 'com.apple.voice.compact.ja-JP.Kyoko');
    });

    test('gender不明のボイス（Android等）も候補に含める', () {
      final picked = pickAutoVoice([
        v('ja-jp-x-jab-local'),
        v('ja-jp-x-jab-network'),
      ], Gender.female);
      expect(picked?.id, 'ja-jp-x-jab-network');
    });

    test('同スコアなら性別一致を優先する', () {
      final picked = pickAutoVoice([
        v('ja-jp-x-unknown-local'),
        v('ja-jp-x-female-local', Gender.female),
      ], Gender.female);
      expect(picked?.id, 'ja-jp-x-female-local');
    });

    test('候補が無ければ null（OS既定のまま）', () {
      expect(pickAutoVoice([], Gender.female), isNull);
      expect(
        pickAutoVoice([v('male-only', Gender.male)], Gender.female),
        isNull,
      );
    });
  });

  group('parseVoices', () {
    test('言語で絞り込み、名前とgenderを取り出す', () {
      final voices = parseVoices([
        {'name': 'Kyoko', 'locale': 'ja-JP', 'gender': 'female'},
        {'name': 'Samantha', 'locale': 'en-US', 'gender': 'female'},
        {'name': 'ja-jp-x-jab-local', 'locale': 'ja-JP'},
      ], 'ja-JP');
      expect(voices.map((v) => v.id), ['Kyoko', 'ja-jp-x-jab-local']);
      expect(voices[0].gender, Gender.female);
      expect(voices[1].gender, isNull);
    });

    test('nullや空でも落ちない', () {
      expect(parseVoices(null, 'ja-JP'), isEmpty);
      expect(parseVoices(<dynamic>[], 'ja-JP'), isEmpty);
    });
  });
}
