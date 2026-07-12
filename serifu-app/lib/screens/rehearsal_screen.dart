import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:record/record.dart';

import '../audio/my_take_store.dart';
import '../audio/prepared_line_speaker.dart';
import '../audio/read_through.dart';
import '../audio/read_through_store.dart';
import '../billing/features.dart';
import '../data/practice_log.dart';
import '../data/script_repository.dart';
import '../data/settings_store.dart';
import '../models/script.dart';
import '../rehearsal/line_matcher.dart';
import '../rehearsal/memorize_mask.dart';
import '../rehearsal/rehearsal_controller.dart';
import '../rehearsal/take_recorder.dart';
import '../speech/cloud_line_audio_preparer.dart';
import '../speech/cloud_tts_client.dart';
import '../speech/device_speech_engine.dart';
import '../speech/line_audio_preparer.dart';
import '../speech/speech_engine.dart';
import '../speech/speech_recognizer.dart';
import '../speech/speech_text.dart';
import '../theme/app_theme.dart';
import '../theme/role_colors.dart';
import 'paywall_screen.dart';
import 'result_screen.dart';

/// リハーサル（再生）画面。
///
/// 進行ロジックは [RehearsalController]（純Dart・テスト済み）に分離し、
/// この画面は「読み上げの実装」「ハンズフリー/自動進行」「表示」を担当する。
/// - 相手役のセリフ：練習開始時に**事前合成**した音声を再生（本番の処理待ちゼロ）。
///   事前合成できない環境ではライブ合成にフォールバック。
/// - 表示モード：台本表示（現在行に自動スクロール）/ 暗記（台本を隠す）の2種。
class RehearsalScreen extends StatefulWidget {
  const RehearsalScreen({super.key, required this.script, this.focusLines});
  final Script script;

  /// 部分練習用：指定するとこの行だけで練習する（つまずいた行＋直前のキュー等）。
  /// null なら台本全体。
  final List<Line>? focusLines;

  @override
  State<RehearsalScreen> createState() => _RehearsalScreenState();
}

class _RehearsalScreenState extends State<RehearsalScreen> {
  final SpeechEngine _engine = DeviceSpeechEngine();
  final SpeechRecognizer _recognizer = SpeechRecognizer();
  final LineAudioPreparer _preparer = LineAudioPreparer();
  final CloudLineAudioPreparer _cloudPreparer = CloudLineAudioPreparer();
  final AudioPlayer _player = AudioPlayer();
  final ScrollController _scroll = ScrollController();
  // ト書きの語り手。テンポは設定の既定速度に合わせる。
  late final _narrator = VoiceProfile(
    gender: Gender.female,
    rate: SettingsStore.instance.settings.defaultRate,
  );

  late final RehearsalController _c;

  /// 事前合成の結果。バックグラウンドで1行ずつ埋まり、
  /// 準備が済んだ行から即座に使われる（未準備の行はライブ合成）。
  final Map<String, String> _preparedMap = {};
  PreparedAudio? _prepared;
  bool _preparing = true;
  int _prepDone = 0;
  int _prepTotal = 0;

  bool _handsFree = false;
  Timer? _autoAdvanceTimer;
  // ハンズフリーの安全ネット：認識が失敗しても、この時間で必ず相手が返る
  // （「言ったのに声が返ってこない」を構造的に防ぐ最後の砦）。
  Timer? _handsFreeSafetyTimer;
  /// 台本の表示段階。覚えかけの時期のために「全部見える」と「全部隠す」の
  /// 間（自分だけ伏せ字／頭文字ヒント）を用意する。
  _ScriptView _view = _ScriptView.full;
  bool _peek = false; // 伏せ字/暗記でのチラ見（現在行だけ一時的に表示）
  String _heard = '';
  RehearsalPhase _lastPhase = RehearsalPhase.idle;
  int _lastIndex = 0;

  /// 認識テキストと台本セリフの照合（誤進行を防ぎ、言い終わりで即進む）。
  final LineMatcher _matcher = LineMatcher();

  /// 自分の番あたりの聞き取り自動再開の回数（無限再開を防ぐ）。
  /// 無音待ち(pauseFor)を短くした分、話し始めまでマイクを生かすため多めに再開する。
  int _listenRestarts = 0;
  static const _maxListenRestarts = 12;

  /// 聞き取り再開の予約中フラグ（'notListening' と 'done' の二重カウント防止）。
  bool _restartPending = false;

  /// この番でこれまでに確定した認識テキスト（セッション再開を跨いで蓄積）。
  /// 途中で間を取って認識が確定しても、前半＋後半を合わせて照合できる。
  String _turnHeard = '';

  /// この番での認識エラー回数（高精度認識への切替提案に使う）。
  int _listenErrors = 0;
  bool _suggestedHighAccuracy = false;

  /// 言い終わり（無音）を検知するまでの待ち時間。
  /// 「話し終わってからトータル約1秒で返す」ため短く固定し、返しの間から差し引く。
  static const _silenceDetectMillis = 500;

  /// 直近の advanceMine までに「言い終わりの無音」として既に経過した時間。
  /// 無音検出で確定した進行のみ 500ms（返しの間から差し引く）。
  /// 語尾一致の即進行・手動ボタン・安全ネットでは 0（無音は経過していない）。
  int _advanceSilenceMs = 0;

  /// 通し本読み（実際の声＋掛け合いの間）。あればTTS・既定の間より優先。
  ReadThroughData? _readThrough;
  String? _readThroughAudio;

  /// 通し録音の「間」のテンポ倍率（テンポ稽古用・この練習の間だけ有効）。
  /// 1.0=録音どおり、0.8=間を2割詰める、1.2=2割広げる。
  double _gapScale = 1.0;

  /// 自分のセリフの自動録音（聞き返し用・ハンズフリーOFF時のみ）。
  /// ハンズフリー中は音声認識がマイクを使うため録音できない。
  final AudioRecorder _myRecorder = AudioRecorder();
  final MyTakeStore _myTakes = MyTakeStore();
  String? _recordingLineId;
  bool _myTakesCleared = false; // 直近1回分だけ保持（初回録音時に前回分を消す）

  Script get s => widget.script;

  /// この練習で使う行（部分練習なら focusLines、通常は台本全体）。
  List<Line> get _lines => widget.focusLines ?? s.lines;

  /// リザルト表示用：練習の開始時刻と遷移済みフラグ。
  late final DateTime _startedAt;

  /// 「詰まったかも」推定用の記録（チラ見・リトライ・所要時間）。
  final _recorder = TakeRecorder();
  bool _navigatedToResult = false;

  @override
  void initState() {
    super.initState();
    _startedAt = DateTime.now();
    _c = RehearsalController(
      lines: _lines,
      myCharacter: s.myCharacter,
      readDirections: s.readDirections,
      speaker: PreparedLineSpeaker(
        player: _player,
        engine: _engine,
        narrator: _narrator,
        voiceFor: s.voiceFor,
        preparedGetter: () => _prepared,
        readThroughGetter: () {
          final data = _readThrough;
          final audio = _readThroughAudio;
          return (data != null && audio != null)
              ? (data: data, audioPath: audio)
              : null;
        },
      ),
      // 「返しの間」＝話し終わってから相手が返るまでの合計。
      // 通し録音にこの行の直前の間が記録されていればそれを、無ければ設定値を使う。
      // 無音検出で確定した進行では、検出に使った時間（≈0.5秒）が既に
      // 経過しているため差し引く（語尾一致の即進行や手動ボタンでは差し引かない）。
      replyPauseProvider: (next) {
        final recorded = _readThrough?.gapBeforeMs(next.id);
        final total = recorded != null
            ? (recorded * _gapScale).round()
            : SettingsStore.instance.settings.replyPauseMillis;
        return Duration(
          milliseconds: (total - _advanceSilenceMs).clamp(0, total),
        );
      },
      // 相手同士の行間は、通し録音の間を再現（テンポ倍率つき。無ければ間なし）。
      lineGapProvider: (next) => Duration(
        milliseconds:
            ((_readThrough?.gapBeforeMs(next.id) ?? 0) * _gapScale).round(),
      ),
    );
    _c.addListener(_onProgress);
    _prepared = PreparedAudio(_preparedMap); // 準備済みの行から順次使う
    _prepareAudio();

    // 「練習開始」を押したらすぐ相手が読み始める（もう一度「再生」を
    // 押させない）。事前合成は裏で進み、準備できた行から使われる。
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_c.running && _c.phase == RehearsalPhase.idle && !_c.atEnd) {
        _c.run();
      }
    });
  }

  @override
  void dispose() {
    _c.removeListener(_onProgress);
    _c.dispose();
    _engine.dispose();
    _recognizer.dispose();
    _preparer.dispose();
    _cloudPreparer.dispose();
    _stopMyLineRecording();
    _myRecorder.dispose();
    _player.dispose();
    _scroll.dispose();
    _autoAdvanceTimer?.cancel();
    _handsFreeSafetyTimer?.cancel();
    _cleanupPreparedFiles();
    super.dispose();
  }

  /// コントローラの変化に応じてUI側の副作用（ハンズフリー・自動進行・スクロール）を行う。
  void _onProgress() {
    if (!mounted) return;
    final phase = _c.phase;

    // 自分の番に入った瞬間：聞き取り or 自動進行タイマーを開始。
    if (phase == RehearsalPhase.waitingForUser && _lastPhase != phase) {
      _heard = '';
      _turnHeard = '';
      _listenRestarts = 0;
      _listenErrors = 0;
      final line = _c.currentLine;
      if (line != null) _recorder.onMyTurnStart(line);
      if (_handsFree) {
        _listenForMyLine();
        _startHandsFreeSafetyNet(line);
      } else {
        _maybeStartAutoAdvance();
        _maybeShowHandsFreeHint();
        _startMyLineRecording(line);
      }
    }
    if (phase != RehearsalPhase.waitingForUser) {
      _autoAdvanceTimer?.cancel();
      _handsFreeSafetyTimer?.cancel();
      _stopMyLineRecording();
    }
    // 最後まで通せたらリザルト画面へ（広告は練習が終わったこの後だけ）。
    if (phase == RehearsalPhase.finished && !_navigatedToResult) {
      _navigatedToResult = true;
      _goToResult();
    }
    if (_c.index != _lastIndex) {
      _peek = false; // 行が進んだらチラ見は閉じる
      _scrollToCurrent();
    }
    _lastPhase = phase;
    _lastIndex = _c.index;
    setState(() {});
  }

  /// 台本表示モードで現在行へ自動スクロール（テレプロンプター追従）。
  void _scrollToCurrent() {
    if (_view == _ScriptView.memorize) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final ctx = _lineKey(_c.index).currentContext;
      if (ctx != null) {
        // 画面内（近傍）に居る → 上から3割の位置へスムーズに。
        Scrollable.ensureVisible(
          ctx,
          alignment: 0.3,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      } else {
        // 画面外 → 推定オフセットへ（ビルドされていない行はcontextが無い）。
        const estimatedExtent = 84.0;
        final target = (_c.index * estimatedExtent - 160)
            .clamp(0.0, _scroll.position.maxScrollExtent);
        _scroll.animateTo(
          target,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  GlobalObjectKey _lineKey(int i) => GlobalObjectKey('${identityHashCode(this)}_line_$i');

  /// ハンズフリーの安全ネット。認識が一度も通らなくても、この猶予のあと
  /// 自動で次へ進めて相手の声を返す（ハンズフリーが行き止まりにならない保証）。
  /// 猶予はセリフの長さに応じる（長ゼリフを途中で切らないよう十分長く取る）。
  /// 通常は認識が先に成功して advanceMine → タイマーは破棄される。
  void _startHandsFreeSafetyNet(Line? line) {
    _handsFreeSafetyTimer?.cancel();
    if (line == null) return;
    // 期待発話時間（1.5秒+150ms/字）の2倍＋4秒。8〜30秒にクランプ。
    // 声に出す部分の長さで見積もる（（）内の演技指示は読まれない）。
    final expected = 1500 + speechText(line.text).length * 150;
    final budgetMs = (expected * 2 + 4000).clamp(8000, 30000);
    _handsFreeSafetyTimer = Timer(Duration(milliseconds: budgetMs), () {
      if (mounted &&
          _handsFree &&
          _c.phase == RehearsalPhase.waitingForUser) {
        _advanceMine(auto: true); // 相手が返る
      }
    });
  }

  /// 自分の番の自動録音を開始（聞き返し用）。
  /// 録音できなくても練習は止めない。Web・ハンズフリー中・設定OFFでは何もしない。
  Future<void> _startMyLineRecording(Line? line) async {
    if (kIsWeb || line == null || _handsFree) return;
    if (!SettingsStore.instance.settings.recordMyLines) return;
    try {
      if (!await _myRecorder.hasPermission()) return;
      if (!_myTakesCleared) {
        _myTakesCleared = true;
        await _myTakes.clear(s.id); // 直近の練習1回分だけを保持
      }
      final path = await _myTakes.pathFor(s.id, line.id);
      await _myRecorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path,
      );
      _recordingLineId = line.id;
    } catch (_) {}
  }

  Future<void> _stopMyLineRecording() async {
    if (_recordingLineId == null) return;
    _recordingLineId = null;
    try {
      await _myRecorder.stop();
    } catch (_) {}
  }

  /// 自分の番：設定の自動進行秒数が正なら、その後に自動で次へ。
  void _maybeStartAutoAdvance() {
    final secs = SettingsStore.instance.settings.autoAdvanceSeconds;
    if (secs <= 0) return;
    _autoAdvanceTimer?.cancel();
    _autoAdvanceTimer = Timer(Duration(seconds: secs), () {
      if (mounted && _c.phase == RehearsalPhase.waitingForUser && !_handsFree) {
        _advanceMine(auto: true);
      }
    });
  }

  /// 台本内容を含む事前合成ファイルを破棄する（端末内に残さない）。
  void _cleanupPreparedFiles() {
    if (kIsWeb) return; // Webは事前合成なし＝ファイルも作られない
    final prepared = _prepared;
    if (prepared == null) return;
    for (final path in prepared.pathByLineId.values) {
      if (ReadThroughStore.isRecordingPath(path)) continue; // 録音は永続
      File(path).delete().catchError((_) => File(path));
    }
  }

  /// 読み込み時に相手役・ト書きの音声を事前合成しておく（本番の処理待ちをゼロに）。
  Future<void> _prepareAudio() async {
    setState(() {
      _preparing = true;
      _prepDone = 0;
      _prepTotal = 0;
    });
    // クラウド音声を使うか（Pro かつ 設定ON かつ エンドポイント設定済み）。
    final useCloud = SettingsStore.instance.settings.useCloudVoices &&
        Features.cloudVoices &&
        CloudTtsConfig.configured;
    void onProgress(int done, int total) {
      if (!mounted) return;
      setState(() {
        _prepDone = done;
        _prepTotal = total;
      });
    }

    // 通し本読みがあれば読み込む。声が入っている行はTTSより優先して
    // 再生され、「間」も録音どおりに再現される（自分の行の声は聞き流しで活きる）。
    final rt = await ReadThroughStore().load(s.id);
    _readThrough = rt?.data;
    _readThroughAudio = rt?.audioPath;
    bool hasVoice(String lineId) =>
        _readThrough?.segmentFor(lineId)?.hasVoice ?? false;

    // 準備が済んだ行から順次 _preparedMap に載せる（本番中でも使える）。
    void onLineReady(String lineId, String path) {
      _preparedMap[lineId] = path;
    }

    // 通し録音に声がある行は合成不要。
    final toSynth = _lines.where((l) => !hasVoice(l.id)).toList();
    try {
      final result = useCloud
          ? await _cloudPreparer.prepare(
              toSynth,
              myCharacter: s.myCharacter,
              readDirections: s.readDirections,
              voiceFor: s.voiceFor,
              narrator: _narrator,
              onProgress: onProgress,
              onLineReady: onLineReady,
            )
          : await _preparer.prepare(
              toSynth,
              myCharacter: s.myCharacter,
              readDirections: s.readDirections,
              voiceFor: s.voiceFor,
              narrator: _narrator,
              onProgress: onProgress,
              onLineReady: onLineReady,
            );
      result.pathByLineId.forEach((id, path) {
        _preparedMap[id] = path;
      });
    } catch (_) {
      // 失敗した分はライブ合成で賄う（準備済みの行はそのまま使える）。
    }
    if (mounted) setState(() => _preparing = false);
  }

  Future<void> _listenForMyLine() async {
    final ok = await _recognizer.init();
    if (!ok) {
      _snack('音声認識を利用できません。手動で進めてください。');
      return;
    }
    // OSの認識セッションは自動終了するため、自分の番が続く間は再開する
    // （台本と一致しないまま確定した場合も聞き直す）。
    _recognizer.onStatus = (status) {
      if (!mounted || !_handsFree || _c.phase != RehearsalPhase.waitingForUser) return;
      if (status == 'error') {
        _listenErrors++;
        _maybeSuggestHighAccuracy();
      }
      final ended = status == 'done' || status == 'notListening' || status == 'error';
      // 1回のセッション終了で 'notListening' と 'done' が連続して届くことがある。
      // 二重に数えると再開回数が実質半減するため、再開予約中は無視する。
      if (ended && !_restartPending && _listenRestarts < _maxListenRestarts) {
        _restartPending = true;
        _listenRestarts++;
        _recorder.onListenRestart();
        Future.delayed(const Duration(milliseconds: 300), () {
          _restartPending = false;
          if (mounted &&
              _handsFree &&
              _c.phase == RehearsalPhase.waitingForUser &&
              !_recognizer.isListening) {
            _startListening();
          }
        });
      } else if (ended && !_restartPending) {
        // 再開上限に達した：聞き取りを諦めた状態をUIに反映する。
        // これをしないとバナーが「聞き取り中…」のまま固まり、
        // ユーザーは「言ったのに相手が返ってこない」と感じる（手動ボタンを見落とす）。
        setState(() {});
      }
    };
    await _startListening();
  }

  /// 認識エラーが続く端末（オンデバイス認識非対応など）では、
  /// 高精度認識（OSのクラウド認識）への切替を一度だけ提案する。
  void _maybeSuggestHighAccuracy() {
    final store = SettingsStore.instance;
    if (_suggestedHighAccuracy ||
        _listenErrors < 3 ||
        store.settings.highAccuracyRecognition) {
      return;
    }
    _suggestedHighAccuracy = true;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 8),
        content: const Text('音声認識がうまく動かないようです。高精度認識（OSの認識サービス）に切り替えますか？'),
        action: SnackBarAction(
          label: '切り替える',
          onPressed: () {
            store.update(
                store.settings.copyWith(highAccuracyRecognition: true));
            if (_handsFree && _c.phase == RehearsalPhase.waitingForUser) {
              _listenRestarts = 0;
              _startListening();
            }
          },
        ),
      ),
    );
  }

  Future<void> _startListening() async {
    final myLine = _c.currentLine;
    // 照合は声に出す部分だけと比べる（（）内の演技指示は発話されない）。
    final expected = speechText(myLine?.text ?? '');
    await _recognizer.start(
      // 既定はオンデバイス認識（プライバシー優先）。設定で高精度(クラウド)を許可。
      preferOnDevice: !SettingsStore.instance.settings.highAccuracyRecognition,
      // 言い終わりの無音検出（返しの間から差し引いて合計を設定値に収める）。
      endSilence: const Duration(milliseconds: _silenceDetectMillis),
      onResult: (text, isFinal) {
        if (!mounted || _c.phase != RehearsalPhase.waitingForUser || !_handsFree) return;
        // 前の行あての残留結果は無視（自分のセリフが連続すると
        // 停止直前のセッションから確定結果が遅れて届くことがある）。
        if (!identical(_c.currentLine, myLine)) return;
        // セッション再開を跨いで発話を蓄積して照合する（セリフ途中で間を
        // 取って認識が一度確定しても、前半＋後半を合わせて判定できる）。
        final combined = _turnHeard.isEmpty ? text : '$_turnHeard $text';
        setState(() => _heard = combined);
        // 発話中は安全ネットを張り直す（長ゼリフや芝居の間で、
        // まだ言っている最中に相手が返ってしまわないように）。
        if (text.isNotEmpty) _startHandsFreeSafetyNet(myLine);
        // 台本セリフと照合：語尾一致なら部分結果でも即進む。
        // 一致が弱いままの確定（雑音・言い直し）は進まず聞き直す。
        if (_matcher.shouldAdvance(
            expected: expected, recognized: combined, isFinal: isFinal)) {
          // 確定結果＝無音検出（約0.5秒）を経ている。部分結果＝言い終わりの
          // 瞬間なので無音は経過していない。返しの間の差し引きに使う。
          _advanceMine(silenceElapsedMs: isFinal ? _silenceDetectMillis : 0);
        } else if (isFinal && text.isNotEmpty) {
          _turnHeard = combined; // 未達の確定は蓄積して聞き直す
        }
      },
    );
  }

  Future<void> _pause() async {
    _autoAdvanceTimer?.cancel();
    _handsFreeSafetyTimer?.cancel();
    await _stopMyLineRecording();
    await _recognizer.stop();
    await _c.pause();
  }

  void _advanceMine({bool auto = false, int silenceElapsedMs = 0}) {
    _recorder.onAdvance(auto: auto);
    _autoAdvanceTimer?.cancel();
    _handsFreeSafetyTimer?.cancel();
    _recognizer.stop();
    _advanceSilenceMs = silenceElapsedMs;
    _c.advanceMine();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _jump(int delta) async {
    _autoAdvanceTimer?.cancel();
    _handsFreeSafetyTimer?.cancel();
    await _recognizer.stop();
    await _c.jump(delta);
  }

  Future<void> _restart() async {
    _autoAdvanceTimer?.cancel();
    _handsFreeSafetyTimer?.cancel();
    await _recognizer.stop();
    await _c.restart();
  }

  /// 練習完了 → リザルト画面へ差し替え遷移（戻るで台本詳細に戻れる）。
  Future<void> _goToResult() async {
    // 進捗の可視化用に1回分を記録（失敗しても遷移は続行）。
    final stuckList = _recorder.stuckLines();
    final myLines = _lines
        .where((l) => l.type == LineType.dialogue && l.speaker == s.myCharacter)
        .length;
    await PracticeLog().add(
      s.id,
      PracticeRecord(
        at: DateTime.now(),
        durationSec: DateTime.now().difference(_startedAt).inSeconds,
        stuckCount: stuckList.length,
        myLineCount: myLines,
        listenMode: _c.listenMode,
        focus: widget.focusLines != null,
      ),
    );
    await _recognizer.stop();
    // 最後のセリフの余韻をひと呼吸だけ待つ。
    await Future<void>.delayed(const Duration(milliseconds: 600));
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => ResultScreen(
          script: s,
          duration: DateTime.now().difference(_startedAt),
          listenMode: _c.listenMode,
          stuck: _recorder.stuckLines(),
          focus: widget.focusLines != null,
        ),
      ),
    );
  }

  /// クイック調整シート：練習を止めずに「間」などをその場で微調整する。
  /// 値は次の行の再生から即反映される。
  Future<void> _showQuickTune() async {
    final store = SettingsStore.instance;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final settings = store.settings;
          final replySec = settings.replyPauseMillis / 1000;
          return Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('クイック調整', style: AppText.h2),
                const SizedBox(height: AppSpacing.sm),
                Text('練習中でもその場で変えられます（次の行から反映）',
                    style: AppText.caption.copyWith(color: AppColors.ink500)),
                const SizedBox(height: AppSpacing.md),
                // 返しの間（自分のセリフ後に相手が返すまで）
                Text('返しの間：${replySec.toStringAsFixed(1)}秒',
                    style: AppText.body),
                Slider(
                  min: 0,
                  max: 3000,
                  divisions: 30,
                  value: settings.replyPauseMillis.toDouble(),
                  onChanged: (v) {
                    store.update(
                        settings.copyWith(replyPauseMillis: v.round()));
                    setSheet(() {});
                  },
                ),
                // 通し録音の間のテンポ（テンポ稽古：録音した間を詰める/広げる）
                if (_readThrough != null) ...[
                  Text(
                    '間のテンポ：×${_gapScale.toStringAsFixed(1)}'
                    '${_gapScale == 1.0 ? '（録音どおり）' : _gapScale < 1.0 ? '（詰める）' : '（広げる）'}',
                    style: AppText.body,
                  ),
                  Slider(
                    min: 0.5,
                    max: 1.5,
                    divisions: 10,
                    value: _gapScale,
                    onChanged: (v) {
                      setState(() => _gapScale = v);
                      setSheet(() {});
                    },
                  ),
                ],
                // 自動進行（手動モードで自分の番を自動で送る）
                Text(
                  settings.autoAdvanceSeconds == 0
                      ? '自動進行：オフ（タップで進める）'
                      : '自動進行：${settings.autoAdvanceSeconds}秒後に次へ',
                  style: AppText.body,
                ),
                Slider(
                  min: 0,
                  max: 10,
                  divisions: 10,
                  value: settings.autoAdvanceSeconds.toDouble(),
                  onChanged: (v) {
                    store.update(
                        settings.copyWith(autoAdvanceSeconds: v.round()));
                    setSheet(() {});
                  },
                ),
                // ト書きの読み上げ（この台本の設定を切替・保存）
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('ト書きを読み上げる'),
                  value: _c.readDirections,
                  onChanged: (v) {
                    _c.readDirections = v;
                    s.readDirections = v;
                    ScriptRepository.instance.touch();
                    setSheet(() {});
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
    if (mounted) setState(() {});
  }

  /// ハンズフリーのON/OFF切替（アプリバーのマイクとヒントの両方から使う）。
  Future<void> _toggleHandsFree() async {
    // Web版はブラウザの音声認識＝発話がブラウザ提供元のサーバで処理される。
    // 端末内処理のネイティブ版と違うため、初回に明示的に同意を取る。
    if (!_handsFree && kIsWeb) {
      final store = SettingsStore.instance;
      if (!store.settings.acceptedWebSpeech) {
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Web版のハンズフリーについて'),
            content: const Text(
              'Web版ではブラウザの音声認識を使うため、発話した音声が'
              'ブラウザ提供元（Apple/Google等）のサーバで処理されることがあります。\n\n'
              'アプリ版（iOS/Android）では可能な限り端末内で認識します。',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('やめておく'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('同意して使う'),
              ),
            ],
          ),
        );
        if (ok != true || !mounted) return;
        store.update(store.settings.copyWith(acceptedWebSpeech: true));
      }
    }
    // ハンズフリーは有料機能。未加入ならペイウォールへ。
    if (!_handsFree && !Features.handsFree) {
      final upgraded = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => const PaywallScreen(reason: 'ハンズフリー進行はプロの機能です'),
        ),
      );
      if (!mounted || upgraded != true) return;
    }
    setState(() => _handsFree = !_handsFree);
    if (_handsFree && _c.phase == RehearsalPhase.waitingForUser) {
      await _stopMyLineRecording(); // 認識とマイクを取り合わない
      _listenForMyLine();
      _startHandsFreeSafetyNet(_c.currentLine);
    } else if (!_handsFree) {
      _handsFreeSafetyTimer?.cancel();
      _recognizer.stop();
      _maybeStartAutoAdvance();
      if (_c.phase == RehearsalPhase.waitingForUser) {
        _startMyLineRecording(_c.currentLine);
      }
    }
  }

  /// 初回だけ、自分の番でハンズフリーの存在を知らせる
  /// （マイクアイコンだけでは気づかれないため）。
  void _maybeShowHandsFreeHint() {
    final store = SettingsStore.instance;
    if (_handsFree || _c.listenMode || store.settings.seenHandsFreeHint) return;
    store.update(store.settings.copyWith(seenHandsFreeHint: true));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 6),
        content: const Text('セリフを言うだけで進めたいときは、右上のマイクをONに'),
        action: SnackBarAction(label: 'ONにする', onPressed: _toggleHandsFree),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final atEnd = _c.atEnd;
    final waiting = _c.phase == RehearsalPhase.waitingForUser;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.title),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'クイック調整（間・ト書き・自動進行）',
            onPressed: _showQuickTune,
          ),
          IconButton(
            icon: Icon(
                _c.listenMode ? Icons.headphones : Icons.headphones_outlined),
            tooltip: _c.listenMode
                ? '聞き流し: ON（自分のセリフも読み上げ）'
                : '聞き流し: OFF',
            onPressed: () async {
              final turningOn = !_c.listenMode;
              setState(() => _c.listenMode = turningOn);
              if (turningOn) {
                _autoAdvanceTimer?.cancel();
                await _recognizer.stop();
                _snack('聞き流しモード：自分のセリフも含めて自動で読み上げます'
                    '（ト書きを含めるかは台本のト書き設定に従います）');
                if (_c.phase == RehearsalPhase.waitingForUser) _c.run();
              } else {
                _snack('稽古モード：自分の番で停止します');
              }
            },
          ),
          IconButton(
            icon: Icon(_handsFree ? Icons.mic : Icons.mic_off),
            tooltip: _handsFree
                ? 'ハンズフリー: ON（セリフを言うと自動で進む）'
                : 'ハンズフリー: OFF（タップでON）',
            onPressed: _toggleHandsFree,
          ),
          IconButton(icon: const Icon(Icons.replay), onPressed: _restart, tooltip: '頭出し'),
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(
            value: _lines.isEmpty
                ? 0
                : (_c.index.clamp(0, _lines.length)) / _lines.length,
          ),
          _buildModeSwitch(),
          if (_preparing) _buildPreparingBanner(),
          Expanded(
              child: _view == _ScriptView.memorize
                  ? _buildMemorizeView()
                  : _buildScriptView()),
          if (waiting) _buildYourTurnBanner(),
          if (atEnd) _buildEndBanner(),
          _buildControls(atEnd),
        ],
      ),
    );
  }

  Widget _buildModeSwitch() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: SegmentedButton<_ScriptView>(
        showSelectedIcon: false,
        style: const ButtonStyle(
          visualDensity: VisualDensity.compact,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        segments: const [
          ButtonSegment(value: _ScriptView.full, label: Text('台本')),
          ButtonSegment(value: _ScriptView.maskMine, label: Text('伏せ字')),
          ButtonSegment(value: _ScriptView.hintMine, label: Text('頭文字')),
          ButtonSegment(value: _ScriptView.memorize, label: Text('暗記')),
        ],
        selected: {_view},
        onSelectionChanged: (set) {
          setState(() {
            _view = set.first;
            _peek = false;
          });
          if (_view != _ScriptView.memorize) _scrollToCurrent();
        },
      ),
    );
  }

  /// 事前合成の進捗バナー（非ブロッキング。準備中でも開始できる）。
  Widget _buildPreparingBanner() {
    final label = _prepTotal == 0
        ? '音声を準備中…（このまま開始できます）'
        : '音声を準備中 $_prepDone / $_prepTotal（このまま開始できます）';
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, 6),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        decoration: BoxDecoration(
          color: AppColors.primary050,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: AppColors.primary100),
        ),
        child: Row(
          children: [
            const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(label,
                  style: AppText.caption.copyWith(color: AppColors.primary700)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildScriptView() {
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(16),
      itemCount: _lines.length,
      itemBuilder: (context, i) {
        final l = _lines[i];
        final current = i == _c.index;
        final mine = _c.isMine(l);
        final isDirection = l.type == LineType.direction;
        final isMeta = l.type == LineType.meta;

        // 自分のセリフの表示テキスト（伏せ字/頭文字。チラ見中の現在行は素の文）。
        final masked = mine && !(_peek && current);
        final displayText = switch (_view) {
          _ScriptView.maskMine when masked => maskLine(l.text),
          _ScriptView.hintMine when masked => maskLine(l.text, revealFirst: true),
          _ => l.text,
        };
        final maskable = mine &&
            current &&
            (_view == _ScriptView.maskMine || _view == _ScriptView.hintMine);

        return GestureDetector(
          onTap: maskable
              ? () => setState(() {
                    _peek = !_peek;
                    if (_peek) _recorder.onPeek(); // チラ見はつまずき推定に使う
                  })
              : null,
          child: Container(
          key: current ? _lineKey(i) : null,
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: current
                ? (mine ? AppColors.accent050 : AppColors.primary050)
                : AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.sm),
            border: Border(
              left: BorderSide(
                color: current
                    ? (mine ? AppColors.accent : AppColors.primary)
                    : Colors.transparent,
                width: 4,
              ),
            ),
            boxShadow: current ? AppShadows.sm : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isDirection && !isMeta)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: _speakerBadge(l.speaker ?? '', mine),
                ),
              Text(
                displayText,
                style: isMeta
                    ? AppText.body.copyWith(color: AppColors.ink300, fontSize: 12)
                    : isDirection
                        ? AppText.body.copyWith(
                            fontStyle: FontStyle.italic, color: AppColors.ink500, fontSize: 14)
                        : AppText.body.copyWith(
                            fontSize: current ? 18 : 15,
                            fontWeight: current ? FontWeight.w700 : FontWeight.w500,
                          ),
              ),
              if (maskable)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _peek ? 'タップで隠す' : 'タップでチラ見',
                    style: AppText.caption.copyWith(color: AppColors.accent600),
                  ),
                ),
            ],
          ),
          ),
        );
      },
    );
  }

  /// 話者バッジ（pill）。自分の役はアンバー、相手は役インデックスでパレットを循環。
  Widget _speakerBadge(String speaker, bool mine) {
    final colors = mine
        ? (bg: AppColors.accent050, fg: AppColors.accent600)
        : roleColors(s.characters.indexOf(speaker));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration:
          BoxDecoration(color: colors.bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(
        '$speaker${mine ? '（あなた）' : ''}',
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: colors.fg),
      ),
    );
  }

  /// 暗記モード：台本本文を隠し、相手の音声と最小限の手がかりだけ表示（舞台ダーク）。
  Widget _buildMemorizeView() {
    final line = _c.currentLine;
    final mine = line != null && _c.isMine(line);
    final isDirection = line?.type == LineType.direction;

    final cue = line == null
        ? '—'
        : mine
            ? 'あなたの番'
            : isDirection
                ? 'ト書き'
                : '相手：${line.speaker ?? ''}';

    return Container(
      color: AppColors.stage900,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${_c.index.clamp(0, _lines.length)} / ${_lines.length}',
                  style: const TextStyle(color: AppColors.stageMuted, fontWeight: FontWeight.w700)),
              const SizedBox(height: AppSpacing.xl),
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: mine ? AppColors.accent : AppColors.stage700,
                ),
                child: Icon(mine ? Icons.record_voice_over : Icons.hearing,
                    size: 44, color: mine ? AppColors.onAccent : AppColors.stageText),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(cue,
                  style: const TextStyle(
                      fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.stageText)),
              const SizedBox(height: AppSpacing.md),
              if (_peek && line != null)
                Text(line.text,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 16, color: AppColors.stageText, height: 1.6))
              else
                Text(
                  mine ? 'セリフを思い出して言ってみましょう' : '（相手のセリフを再生中）',
                  style: const TextStyle(color: AppColors.stageMuted),
                  textAlign: TextAlign.center,
                ),
              const SizedBox(height: AppSpacing.lg),
              TextButton.icon(
                onPressed: () => setState(() {
                  _peek = !_peek;
                  if (_peek) _recorder.onPeek();
                }),
                style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                icon: Icon(_peek ? Icons.visibility_off : Icons.visibility),
                label: Text(_peek ? '隠す' : 'チラ見'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildYourTurnBanner() {
    final line = _c.currentLine;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.accent050,
        border: Border(top: BorderSide(color: AppColors.accent200)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.record_voice_over, size: 18, color: AppColors.accent600),
              const SizedBox(width: 6),
              Text('あなたの番です',
                  style: AppText.body.copyWith(
                      fontWeight: FontWeight.w800, color: AppColors.accent600)),
            ],
          ),
          // 暗記では本文を出さない（チラ見で確認）。伏せ字/頭文字はその形で出す。
          if (line != null && _view != _ScriptView.memorize) ...[
            const SizedBox(height: 4),
            Text(
              switch (_view) {
                _ScriptView.maskMine => maskLine(line.text),
                _ScriptView.hintMine => maskLine(line.text, revealFirst: true),
                _ => line.text,
              },
              textAlign: TextAlign.center,
              style: AppText.body,
            ),
          ],
          if (_handsFree) ...[
            const SizedBox(height: 6),
            Builder(builder: (_) {
              // 聞き取りを諦めた（再開上限に達した）ら、その旨を明示。
              final gaveUp = _listenRestarts >= _maxListenRestarts &&
                  !_recognizer.isListening;
              final status = gaveUp
                  ? 'うまく聞き取れません。少し待つと自動で進みます'
                  : '聞き取り中…（言い終わると自動で進みます）';
              return Column(
                children: [
                  // マイクの状態行。
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        gaveUp
                            ? Icons.mic_off
                            : (_recognizer.isListening
                                ? Icons.mic
                                : Icons.mic_none),
                        size: 18,
                        color: gaveUp ? AppColors.ink500 : AppColors.accent600,
                      ),
                      const SizedBox(width: 6),
                      Flexible(child: Text(status, style: AppText.caption)),
                    ],
                  ),
                  // 聞き取れた言葉をそのまま文字で見せる（自分の声が
                  // どう認識されたか分かる＝進まない不安の解消）。
                  if (_heard.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(AppRadius.md),
                        border: Border.all(color: AppColors.accent200),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.hearing,
                              size: 16, color: AppColors.accent600),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(_heard,
                                style: AppText.body.copyWith(
                                    fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              );
            }),
          ],
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: _advanceMine,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accent,
              foregroundColor: AppColors.onAccent,
            ),
            icon: const Icon(Icons.skip_next),
            label: const Text('言えた・次へ'),
          ),
        ],
      ),
    );
  }

  Widget _buildEndBanner() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      color: AppColors.success.withValues(alpha: 0.12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, color: AppColors.success, size: 20),
          const SizedBox(width: 8),
          Text('お疲れさまでした（最後まで到達）',
              style: AppText.body.copyWith(color: AppColors.success, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _buildControls(bool atEnd) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            IconButton(icon: const Icon(Icons.skip_previous), onPressed: () => _jump(-1)),
            if (_c.running)
              FilledButton.icon(
                onPressed: _pause,
                icon: const Icon(Icons.pause),
                label: const Text('一時停止'),
              )
            else
              FilledButton.icon(
                // 自分の番は「言えた・次へ」で進める（ここで run すると
                // 聞き取りや録音のターン開始処理が二重に走るため無効化）。
                onPressed: atEnd || _c.phase == RehearsalPhase.waitingForUser
                    ? null
                    : _c.run,
                icon: const Icon(Icons.play_arrow),
                label: const Text('再生'),
              ),
            IconButton(icon: const Icon(Icons.skip_next), onPressed: () => _jump(1)),
          ],
        ),
      ),
    );
  }
}

/// 台本の表示段階（覚えかけ→暗記への階段）。
enum _ScriptView {
  full, // 全部見える
  maskMine, // 自分のセリフだけ伏せ字（リズムの手がかりは残す）
  hintMine, // 自分のセリフは頭文字だけ
  memorize, // 全部隠す（舞台ダーク）
}
