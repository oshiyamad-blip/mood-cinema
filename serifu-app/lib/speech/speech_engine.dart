import '../models/script.dart';

/// 読み上げエンジンの抽象。
///
/// MVPは [DeviceSpeechEngine]（端末内蔵TTS・無料・オフライン）のみ実装。
/// 将来、学習非利用が保証されたAPIを用いた CloudSpeechEngine を差し込めるよう
/// インターフェースを分離しておく。
abstract class SpeechEngine {
  /// 利用可能なボイス一覧（言語で絞り込み）。
  Future<List<TtsVoice>> voices(String languageCode);

  /// 指定の声設定でテキストを読み上げ、完了まで待つ。
  Future<void> speak(String text, VoiceProfile profile);

  /// 読み上げを停止する。
  Future<void> stop();

  Future<void> dispose();
}

/// TTSボイスのメタ情報。
class TtsVoice {
  TtsVoice({required this.id, required this.name, this.gender});
  final String id;
  final String name;
  final Gender? gender;
}
