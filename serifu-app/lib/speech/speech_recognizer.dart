import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:speech_to_text/speech_recognition_error.dart';
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

  /// 認識エラーの詳細（例: 'not-allowed' / 'error_permission' / 'network'）。
  /// マイクがブロックされている等、ユーザーに伝えるべき失敗の判別に使う。
  void Function(String error, bool permanent)? onError;

  // 現在の聞き取りセッション（Webの「確定」補完用）。
  void Function(String text, bool isFinal)? _sessionOnResult;
  String _sessionLastWords = '';
  bool _sessionGotFinal = false;

  bool get isAvailable => _available;
  bool get isListening => _stt.isListening;

  /// 既定の認識言語。Web（ブラウザの音声認識）はBCP-47のハイフン形式、
  /// iOS/Android のプラグインはアンダースコア形式を期待する。
  static String get defaultLocaleId => kIsWeb ? 'ja-JP' : 'ja_JP';

  /// マイク・認識の権限がない（ブロックされている）ことを示すエラーか。
  static bool isPermissionError(String error) {
    final e = error.toLowerCase();
    return e.contains('not-allowed') ||
        e.contains('not_allowed') ||
        e.contains('permission') ||
        e.contains('service-not-allowed') ||
        e.contains('audio-capture');
  }

  /// SpeechToText はアプリ全体で1つ（シングルトン）で、2回目以降の
  /// initialize() はコールバックを登録し直さない。画面ごとに作る本クラスの
  /// 通知が届くよう、使うたびにリスナーを自分へ付け替える。
  void _bind() {
    _stt.errorListener = (SpeechRecognitionError e) {
      onError?.call(e.errorMsg, e.permanent);
      onStatus?.call('error');
    };
    _stt.statusListener = _handleStatus;
  }

  void _handleStatus(String status) {
    final ended = status == 'done' || status == 'notListening';
    // Webのブラウザ認識は結果をすべて「途中経過」として返し、確定を送らない。
    // セッションが終わった時点の最後の言葉を確定扱いにして渡す
    // （蓄積照合・確定時の緩い判定が効くように）。
    if (kIsWeb && ended && !_sessionGotFinal && _sessionLastWords.isNotEmpty) {
      _sessionGotFinal = true;
      _sessionOnResult?.call(_sessionLastWords, true);
    }
    onStatus?.call(status);
  }

  /// 初期化（マイク権限の要求を含む）。利用可否を返す。
  /// 音声認識に対応していないブラウザ（Firefox等）では false。
  Future<bool> init() async {
    _bind();
    if (_available) return true;
    try {
      _available = await _stt.initialize(
        onError: (e) {
          onError?.call(e.errorMsg, e.permanent);
          onStatus?.call('error');
        },
        onStatus: _handleStatus,
      );
    } catch (_) {
      _available = false;
    }
    // 初期化済みのシングルトンは上のコールバックを捨てるので付け直す。
    _bind();
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
    String? localeId,
    Duration listenFor = const Duration(seconds: 60),
    Duration preSpeechGrace = const Duration(seconds: 20),
    Duration endSilence = const Duration(milliseconds: 500),
    bool preferOnDevice = true,
  }) async {
    if (!_available) {
      if (!await init()) return;
    }
    _bind();
    var gotFirstResult = false;
    _sessionOnResult = onResult;
    _sessionLastWords = '';
    _sessionGotFinal = false;
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
          if (r.recognizedWords.isNotEmpty) {
            _sessionLastWords = r.recognizedWords;
          }
          if (r.finalResult) _sessionGotFinal = true;
          onResult(r.recognizedWords, r.finalResult);
        },
        listenOptions: SpeechListenOptions(
          onDevice: preferOnDevice,
          partialResults: true,
          localeId: localeId ?? defaultLocaleId,
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
    _sessionOnResult = null; // 停止後に遅れて届く結果を確定扱いにしない
    if (_stt.isListening) await _stt.stop();
  }

  Future<void> dispose() async {
    onStatus = null;
    onError = null;
    await stop();
  }
}
