import 'package:speech_to_text/speech_to_text.dart';

/// OS標準の音声認識ラッパー（ハンズフリー進行用）。
///
/// 自分のセリフを言い終えたこと（発話の区切り＝finalResult）を検知して、
/// 相手役の自動再生へ進めるために使う。
class SpeechRecognizer {
  final SpeechToText _stt = SpeechToText();
  bool _available = false;

  bool get isAvailable => _available;
  bool get isListening => _stt.isListening;

  /// 初期化（マイク権限の要求を含む）。利用可否を返す。
  Future<bool> init() async {
    if (_available) return true;
    _available = await _stt.initialize(
      onError: (_) {},
      onStatus: (_) {},
    );
    return _available;
  }

  /// 聞き取りを開始する。
  /// [onResult] は (認識テキスト, 確定か) を返す。確定でハンズフリー進行する。
  Future<void> start({
    required void Function(String text, bool isFinal) onResult,
    String localeId = 'ja_JP',
    Duration listenFor = const Duration(seconds: 30),
    Duration pauseFor = const Duration(seconds: 2),
  }) async {
    if (!_available) {
      if (!await init()) return;
    }
    await _stt.listen(
      onResult: (r) => onResult(r.recognizedWords, r.finalResult),
      localeId: localeId,
      listenFor: listenFor,
      pauseFor: pauseFor,
    );
  }

  Future<void> stop() async {
    if (_stt.isListening) await _stt.stop();
  }

  Future<void> dispose() async {
    await stop();
  }
}
