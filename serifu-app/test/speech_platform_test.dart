import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/speech/device_speech_engine.dart';
import 'package:serifu_app/speech/speech_recognizer.dart';

void main() {
  group('読み上げ速度の変換', () {
    test('モバイルは半分（0.5が等速）', () {
      expect(DeviceSpeechEngine.platformRate(1.0, web: false), 0.5);
      expect(DeviceSpeechEngine.platformRate(1.7, web: false), closeTo(0.85, 1e-9));
    });
    test('Webはそのまま（1.0が等速）— 既定1.7倍が0.85倍にならない', () {
      expect(DeviceSpeechEngine.platformRate(1.0, web: true), 1.0);
      expect(DeviceSpeechEngine.platformRate(1.7, web: true), 1.7);
      expect(DeviceSpeechEngine.platformRate(5.0, web: true), 2.0); // 上限
    });
  });

  group('男女の声の演じ分け', () {
    test('男女で同じ声しか無いときは高さで分ける', () {
      final m = VoiceProfile(gender: Gender.male);
      final f = VoiceProfile(gender: Gender.female);
      expect(DeviceSpeechEngine.effectivePitch(m, shared: true), lessThan(1.0));
      expect(DeviceSpeechEngine.effectivePitch(f, shared: true), greaterThan(1.0));
    });
    test('明示的に高さを設定した役・声が分かれている環境はそのまま', () {
      final custom = VoiceProfile(gender: Gender.male, pitch: 1.3);
      expect(DeviceSpeechEngine.effectivePitch(custom, shared: true), 1.3);
      final m = VoiceProfile(gender: Gender.male);
      expect(DeviceSpeechEngine.effectivePitch(m, shared: false), 1.0);
    });
  });

  group('音声認識', () {
    test('マイク拒否系のエラーを判別する（Web/モバイル）', () {
      for (final e in ['not-allowed', 'service-not-allowed', 'audio-capture', 'error_permission']) {
        expect(SpeechRecognizer.isPermissionError(e), isTrue, reason: e);
      }
      for (final e in ['no-speech', 'error_no_match', 'network', 'error_speech_timeout']) {
        expect(SpeechRecognizer.isPermissionError(e), isFalse, reason: e);
      }
    });
    test('モバイルの認識言語はアンダースコア形式', () {
      expect(SpeechRecognizer.defaultLocaleId, 'ja_JP'); // テストはWeb以外で動く
    });
  });
}
