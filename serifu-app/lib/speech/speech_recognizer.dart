import 'package:speech_to_text/speech_to_text.dart';

/// OS標準の音声認識ラッパー（ハンズフリー進行用）。
///
/// 自分のセリフの発話を聞き取り、[LineMatcher]（呼び出し側）で
/// 台本セリフと照合して進行判定に使う。
class SpeechRecognizer {
  final SpeechToText _stt = SpeechToText();
  bool _available = false;

  /// 認識セッションの状態通知（'listening' / 'notListening' / 'done' / 'error'）。
  /// 呼び出し側はこれを使って**聞き取りの自動再開**を行える
  /// （OSの認識は数十秒で自動終了するため、再開しないと無言で止まる）。
  void Function(String status)? onStatus;

  bool get isAvailable => _available;
  bool get isListening => _stt.isListening;

  /// 初期化（マイク権限の要求を含む）。利用可否を返す。
  Future<bool> init() async {
    if (_available) return true;
    _available = await _stt.initialize(
      onError: (_) => onStatus?.call('error'),
      onStatus: (s) => onStatus?.call(s),
    );
    return _available;
  }

  /// 聞き取りを開始する。
  /// [onResult] は (認識テキスト, 確定か) を返す。
  ///
  /// 無音待ちは二段構え：
  /// - 話し始めるまでは [preSpeechGrace]（芝居の間・長考でセッションが
  ///   死なないよう長め。プラグインの pauseFor は「認識結果イベントの途絶」を
  ///   listen 開始直後から数えるため、短いと発話前に切れて再開を繰り返す）。
  /// - 最初の結果が届いたら [endSilence] に切り替え（changePauseFor）、
  ///   言い終わりの無音から素早く確定して相手が返る。
  ///
  /// プライバシー方針：[preferOnDevice] が true の間は可能な限り
  /// **オンデバイス音声認識**を使う（セリフ音声をクラウドへ送らない）。
  /// 設定で「高精度認識」を選んだ場合のみ false（OSのクラウド認識を許可）。
  Future<void> start({
    required void Function(String text, bool isFinal) onResult,
    String localeId = 'ja_JP',
    Duration listenFor = const Duration(seconds: 60),
    Duration preSpeechGrace = const Duration(seconds: 20),
    Duration endSilence = const Duration(milliseconds: 500),
    bool preferOnDevice = true,
  }) async {
    if (!_available) {
      if (!await init()) return;
    }
    var gotFirstResult = false;
    try {
      await _stt.listen(
        onResult: (r) {
          if (!gotFirstResult && r.recognizedWords.isNotEmpty) {
            gotFirstResult = true;
            // 発話が始まった：無音待ちを「言い終わり検出」の短さへ。
            try {
              _stt.changePauseFor(endSilence);
            } catch (_) {}
          }
          onResult(r.recognizedWords, r.finalResult);
        },
        listenOptions: SpeechListenOptions(
          onDevice: preferOnDevice,
          partialResults: true,
          localeId: localeId,
          listenFor: listenFor,
          pauseFor: preSpeechGrace,
          // セリフは一息の長文になりがち。逐次書き取りモードの方が
          // 途中で確定されにくく、取りこぼしが減る。
          listenMode: ListenMode.dictation,
        ),
      );
    } catch (_) {
      // オンデバイス認識非対応端末などで listen が例外を投げることがある。
      // 黙って死なせず error を通知し、呼び出し側のUI（手動ボタン誘導）に委ねる。
      onStatus?.call('error');
    }
  }

  Future<void> stop() async {
    if (_stt.isListening) await _stt.stop();
  }

  Future<void> dispose() async {
    onStatus = null;
    await stop();
  }
}
