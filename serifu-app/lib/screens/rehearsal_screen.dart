import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../audio/recording_store.dart';
import '../billing/features.dart';
import '../data/script_repository.dart';
import '../data/settings_store.dart';
import '../models/script.dart';
import '../rehearsal/line_matcher.dart';
import '../rehearsal/rehearsal_controller.dart';
import '../rehearsal/take_recorder.dart';
import '../speech/cloud_line_audio_preparer.dart';
import '../speech/cloud_tts_client.dart';
import '../speech/device_speech_engine.dart';
import '../speech/line_audio_preparer.dart';
import '../speech/speech_engine.dart';
import '../speech/speech_recognizer.dart';
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

/// 事前合成済みの音声を再生する読み上げ器。
/// 合成が無い行は端末TTSでライブ合成する。
/// 再生完了は audioplayers の状態イベントで待つ（ポーリングしない）。
class _PreparedLineSpeaker implements RehearsalLineSpeaker {
  _PreparedLineSpeaker({
    required this.player,
    required this.engine,
    required this.narrator,
    required this.voiceFor,
    required this.preparedGetter,
  });

  final AudioPlayer player;
  final SpeechEngine engine;
  final VoiceProfile narrator;
  final VoiceProfile Function(String character) voiceFor;
  final PreparedAudio? Function() preparedGetter;

  @override
  Future<void> speakLine(Line line) async {
    final path = preparedGetter()?.pathFor(line.id);
    if (path != null) {
      await _playFile(path);
    } else {
      final profile =
          line.type == LineType.direction ? narrator : voiceFor(line.speaker ?? '');
      await engine.speak(line.text, profile);
    }
  }

  Future<void> _playFile(String path) async {
    final done = Completer<void>();
    // completed（再生終了）または stopped（stop()による中断）で解決する。
    // 進行は逐次実行なので、前の再生の残留イベントを拾う心配はない。
    final sub = player.onPlayerStateChanged.listen((st) {
      if (st == PlayerState.completed || st == PlayerState.stopped) {
        if (!done.isCompleted) done.complete();
      }
    });
    try {
      await player.play(DeviceFileSource(path));
      // 壊れた/空の録音ファイル等で完了イベントが来ないと永久に待ってしまう。
      // 安全弁として上限時間で必ず解決し、次の行へ進める。
      await done.future.timeout(const Duration(seconds: 30), onTimeout: () {});
    } finally {
      await sub.cancel();
    }
  }

  @override
  Future<void> stop() async {
    await player.stop(); // stopped イベントで _playFile が解決する
    await engine.stop();
  }
}

class _RehearsalScreenState extends State<RehearsalScreen> {
  final SpeechEngine _engine = DeviceSpeechEngine();
  final SpeechRecognizer _recognizer = SpeechRecognizer();
  final LineAudioPreparer _preparer = LineAudioPreparer();
  final CloudLineAudioPreparer _cloudPreparer = CloudLineAudioPreparer();
  final AudioPlayer _player = AudioPlayer();
  final ScrollController _scroll = ScrollController();
  final _narrator = VoiceProfile(gender: Gender.female, rate: 1.0);

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
  bool _showScript = true; // false = 暗記モード
  bool _peek = false; // 暗記モードでのチラ見
  String _heard = '';
  RehearsalPhase _lastPhase = RehearsalPhase.idle;
  int _lastIndex = 0;

  /// 認識テキストと台本セリフの照合（誤進行を防ぎ、言い終わりで即進む）。
  final LineMatcher _matcher = LineMatcher();

  /// 自分の番あたりの聞き取り自動再開の回数（無限再開を防ぐ）。
  int _listenRestarts = 0;
  static const _maxListenRestarts = 5;

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
      speaker: _PreparedLineSpeaker(
        player: _player,
        engine: _engine,
        narrator: _narrator,
        voiceFor: s.voiceFor,
        preparedGetter: () => _prepared,
      ),
      // 「返しの間」は設定から毎回読む（変更を即時反映）。
      replyPauseProvider: () => Duration(
        milliseconds: SettingsStore.instance.settings.replyPauseMillis,
      ),
    );
    _c.addListener(_onProgress);
    _prepared = PreparedAudio(_preparedMap); // 準備済みの行から順次使う
    _prepareAudio();
  }

  @override
  void dispose() {
    _c.removeListener(_onProgress);
    _c.dispose();
    _engine.dispose();
    _recognizer.dispose();
    _preparer.dispose();
    _cloudPreparer.dispose();
    _player.dispose();
    _scroll.dispose();
    _autoAdvanceTimer?.cancel();
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
      _listenRestarts = 0;
      final line = _c.currentLine;
      if (line != null) _recorder.onMyTurnStart(line);
      if (_handsFree) {
        _listenForMyLine();
      } else {
        _maybeStartAutoAdvance();
      }
    }
    if (phase != RehearsalPhase.waitingForUser) {
      _autoAdvanceTimer?.cancel();
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
    if (!_showScript) return;
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
      if (RecordingStore.isRecordingPath(path)) continue; // 録音は永続
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

    // 本読み録音があればTTSより優先して使う（自分の行の録音は聞き流しで活きる）。
    final recordings = await RecordingStore().loadAll(s.id);
    _preparedMap.addAll(recordings);

    // 準備が済んだ行から順次 _preparedMap に載せる（本番中でも使える）。
    // 録音済みの行は上書きしない。
    void onLineReady(String lineId, String path) {
      if (!recordings.containsKey(lineId)) _preparedMap[lineId] = path;
    }

    // 録音済みの行は合成不要。
    final toSynth =
        _lines.where((l) => !recordings.containsKey(l.id)).toList();
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
        if (!recordings.containsKey(id)) _preparedMap[id] = path;
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
      final ended = status == 'done' || status == 'notListening' || status == 'error';
      if (ended && _listenRestarts < _maxListenRestarts) {
        _listenRestarts++;
        _recorder.onListenRestart();
        Future.delayed(const Duration(milliseconds: 300), () {
          if (mounted &&
              _handsFree &&
              _c.phase == RehearsalPhase.waitingForUser &&
              !_recognizer.isListening) {
            _startListening();
          }
        });
      } else if (ended) {
        // 再開上限に達した：聞き取りを諦めた状態をUIに反映する。
        // これをしないとバナーが「聞き取り中…」のまま固まり、
        // ユーザーは「言ったのに相手が返ってこない」と感じる（手動ボタンを見落とす）。
        setState(() {});
      }
    };
    await _startListening();
  }

  Future<void> _startListening() async {
    final expected = _c.currentLine?.text ?? '';
    await _recognizer.start(
      // 既定はオンデバイス認識（プライバシー優先）。設定で高精度(クラウド)を許可。
      preferOnDevice: !SettingsStore.instance.settings.highAccuracyRecognition,
      onResult: (text, isFinal) {
        if (!mounted || _c.phase != RehearsalPhase.waitingForUser || !_handsFree) return;
        setState(() => _heard = text);
        // 台本セリフと照合：語尾一致なら部分結果でも即進む。
        // 一致が弱いままの確定（雑音・言い直し）は進まず聞き直す。
        if (_matcher.shouldAdvance(expected: expected, recognized: text, isFinal: isFinal)) {
          _advanceMine();
        }
      },
    );
  }

  Future<void> _pause() async {
    _autoAdvanceTimer?.cancel();
    await _recognizer.stop();
    await _c.pause();
  }

  void _advanceMine({bool auto = false}) {
    _recorder.onAdvance(auto: auto);
    _autoAdvanceTimer?.cancel();
    _recognizer.stop();
    _c.advanceMine();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _jump(int delta) async {
    _autoAdvanceTimer?.cancel();
    await _recognizer.stop();
    await _c.jump(delta);
  }

  Future<void> _restart() async {
    _autoAdvanceTimer?.cancel();
    await _recognizer.stop();
    await _c.restart();
  }

  /// 練習完了 → リザルト画面へ差し替え遷移（戻るで台本詳細に戻れる）。
  Future<void> _goToResult() async {
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
            tooltip: _handsFree ? 'ハンズフリー: ON' : 'ハンズフリー: OFF（プロ）',
            onPressed: () async {
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
                _listenForMyLine();
              } else if (!_handsFree) {
                _recognizer.stop();
              }
            },
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
          Expanded(child: _showScript ? _buildScriptView() : _buildMemorizeView()),
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
      child: SegmentedButton<bool>(
        segments: const [
          ButtonSegment(value: true, label: Text('台本表示'), icon: Icon(Icons.menu_book, size: 18)),
          ButtonSegment(value: false, label: Text('暗記'), icon: Icon(Icons.visibility_off, size: 18)),
        ],
        selected: {_showScript},
        onSelectionChanged: (set) {
          setState(() => _showScript = set.first);
          if (set.first) _scrollToCurrent();
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

        return Container(
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
                l.text,
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
            ],
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
          // 暗記モードでは本文を出さない（チラ見で確認）。
          if (line != null && _showScript) ...[
            const SizedBox(height: 4),
            Text(line.text, textAlign: TextAlign.center, style: AppText.body),
          ],
          if (_handsFree) ...[
            const SizedBox(height: 6),
            Builder(builder: (_) {
              // 聞き取りを諦めた（再開上限に達した）ら、その旨を明示して
              // 手動ボタンへ誘導する（「聞き取り中…」のまま固めない）。
              final gaveUp = _listenRestarts >= _maxListenRestarts &&
                  !_recognizer.isListening;
              final label = gaveUp
                  ? '聞き取れませんでした。下のボタンで進めてください'
                  : (_heard.isEmpty ? '聞き取り中…（言い終わると自動で進みます）' : _heard);
              return Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    gaveUp
                        ? Icons.mic_off
                        : (_recognizer.isListening ? Icons.mic : Icons.mic_none),
                    size: 18,
                    color: gaveUp ? AppColors.ink500 : AppColors.accent600,
                  ),
                  const SizedBox(width: 6),
                  Flexible(child: Text(label, style: AppText.caption)),
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
                onPressed: atEnd ? null : _c.run,
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
