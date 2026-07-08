import 'package:flutter_tts/flutter_tts.dart';

import '../models/script.dart';
import 'speech_engine.dart';

/// 端末内蔵TTS（iOS AVSpeechSynthesizer / Android TextToSpeech）を
/// flutter_tts 経由で使う実装。無料・オフライン・台本データは端末外に出ない。
class DeviceSpeechEngine implements SpeechEngine {
  DeviceSpeechEngine({this.languageCode = 'ja-JP'});

  final String languageCode;
  final FlutterTts _tts = FlutterTts();
  bool _initialized = false;

  Future<void> _ensureInit() async {
    if (_initialized) return;
    await _tts.setLanguage(languageCode);
    // speak() が完了するまで await できるようにする。
    await _tts.awaitSpeakCompletion(true);
    _initialized = true;
  }

  @override
  Future<List<TtsVoice>> voices(String languageCode) async {
    await _ensureInit();
    final raw = (await _tts.getVoices) as List<dynamic>?;
    if (raw == null) return [];
    final result = <TtsVoice>[];
    for (final v in raw) {
      final map = Map<String, dynamic>.from(v as Map);
      final locale = (map['locale'] ?? '').toString();
      if (!locale.toLowerCase().startsWith(languageCode.toLowerCase().split('-').first)) {
        continue;
      }
      final name = (map['name'] ?? '').toString();
      result.add(TtsVoice(id: name, name: name, gender: _guessGender(map)));
    }
    return result;
  }

  /// プラットフォームによっては gender 情報が無いため推測（ヒューリスティック）。
  Gender? _guessGender(Map<String, dynamic> map) {
    final g = (map['gender'] ?? '').toString().toLowerCase();
    if (g.contains('male') && !g.contains('female')) return Gender.male;
    if (g.contains('female')) return Gender.female;
    return null;
  }

  @override
  Future<void> speak(String text, VoiceProfile profile) async {
    if (text.trim().isEmpty) return;
    await _ensureInit();

    // テンポ（速度）。flutter_tts の rate は 0.0〜1.0 を基準にプラットフォーム差があるため、
    // 0.5〜2.0 の論理値を 0.0〜1.0 帯へマップ（1.0 → 0.5 が等速の目安）。
    final mappedRate = (profile.rate * 0.5).clamp(0.0, 1.0);
    await _tts.setSpeechRate(mappedRate);
    await _tts.setPitch(profile.pitch.clamp(0.5, 2.0));

    if (profile.voiceId != null && profile.voiceId!.isNotEmpty) {
      await _tts.setVoice({'name': profile.voiceId!, 'locale': languageCode});
    }

    await _tts.speak(text);
  }

  @override
  Future<void> stop() => _tts.stop();

  @override
  Future<void> dispose() async {
    await _tts.stop();
  }
}
