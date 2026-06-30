import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../billing/features.dart';
import '../models/script.dart';
import '../speech/device_speech_engine.dart';
import '../speech/line_audio_preparer.dart';
import '../speech/speech_engine.dart';
import '../speech/speech_recognizer.dart';
import '../theme/app_theme.dart';
import 'paywall_screen.dart';

/// リハーサル（再生）画面。
///
/// - 相手役のセリフ：練習開始時に**事前合成**した音声を再生（本番の処理待ちゼロ）。
///   事前合成できない環境ではライブ合成にフォールバック。
/// - 自分のセリフ：読み上げず一時停止。ハンズフリーON時は音声認識で自動進行。
/// - 表示モード：台本表示（読み上げ追従）/ 暗記（台本を隠して練習）の2種。
class RehearsalScreen extends StatefulWidget {
  const RehearsalScreen({super.key, required this.script});
  final Script script;

  @override
  State<RehearsalScreen> createState() => _RehearsalScreenState();
}

class _RehearsalScreenState extends State<RehearsalScreen> {
  final SpeechEngine _engine = DeviceSpeechEngine();
  final SpeechRecognizer _recognizer = SpeechRecognizer();
  final LineAudioPreparer _preparer = LineAudioPreparer();
  final AudioPlayer _player = AudioPlayer();
  final _narrator = VoiceProfile(gender: Gender.female, rate: 1.0);

  PreparedAudio? _prepared;
  bool _preparing = true;
  int _prepDone = 0;
  int _prepTotal = 0;

  int _index = 0;
  bool _running = false;
  bool _waitingForUser = false;
  bool _handsFree = false;
  bool _showScript = true; // false = 暗記モード
  bool _peek = false; // 暗記モードでのチラ見
  String _heard = '';

  Script get s => widget.script;
  List<Line> get lines => s.lines;

  @override
  void initState() {
    super.initState();
    _prepareAudio();
  }

  @override
  void dispose() {
    _running = false;
    _engine.dispose();
    _recognizer.dispose();
    _preparer.dispose();
    _player.dispose();
    _cleanupPreparedFiles();
    super.dispose();
  }

  /// 台本内容を含む事前合成ファイルを破棄する（端末内に残さない）。
  void _cleanupPreparedFiles() {
    final prepared = _prepared;
    if (prepared == null) return;
    for (final path in prepared.pathByLineId.values) {
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
    try {
      _prepared = await _preparer.prepare(
        lines,
        myCharacter: s.myCharacter,
        readDirections: s.readDirections,
        voiceFor: s.voiceFor,
        narrator: _narrator,
        onProgress: (done, total) {
          if (!mounted) return;
          setState(() {
            _prepDone = done;
            _prepTotal = total;
          });
        },
      );
    } catch (_) {
      _prepared = null; // ライブ合成にフォールバック
    }
    if (mounted) setState(() => _preparing = false);
  }

  bool _isMine(Line l) => l.type == LineType.dialogue && l.speaker == s.myCharacter;

  Future<void> _run() async {
    if (_running || _preparing) return;
    _running = true;
    setState(() => _waitingForUser = false);

    while (_running && _index < lines.length) {
      final line = lines[_index];
      setState(() => _peek = false);

      if (_isMine(line)) {
        _running = false;
        setState(() {
          _waitingForUser = true;
          _heard = '';
        });
        if (_handsFree) _listenForMyLine();
        return;
      }

      if (line.type == LineType.direction && !s.readDirections) {
        await Future.delayed(const Duration(milliseconds: 500));
      } else {
        await _speakLine(line);
      }

      if (!_running) return;
      _index++;
    }
    _running = false;
    setState(() {});
  }

  /// 事前合成済みなら即再生（処理待ちゼロ）。無ければライブ合成。
  Future<void> _speakLine(Line line) async {
    final path = _prepared?.pathFor(line.id);
    if (path != null) {
      await _playFile(path);
    } else {
      final profile =
          line.type == LineType.direction ? _narrator : s.voiceFor(line.speaker ?? '');
      await _engine.speak(line.text, profile);
    }
  }

  Future<void> _playFile(String path) async {
    await _player.stop();
    await _player.play(DeviceFileSource(path));
    // 再生完了 または 中断(_running=false) まで待つ。
    while (_running && _player.state == PlayerState.playing) {
      await Future.delayed(const Duration(milliseconds: 80));
    }
  }

  Future<void> _listenForMyLine() async {
    final ok = await _recognizer.init();
    if (!ok) {
      _snack('音声認識を利用できません。手動で進めてください。');
      return;
    }
    await _recognizer.start(
      onResult: (text, isFinal) {
        if (!mounted || !_waitingForUser || !_handsFree) return;
        setState(() => _heard = text);
        if (isFinal && text.trim().isNotEmpty) {
          _advanceMine();
        }
      },
    );
  }

  Future<void> _pause() async {
    _running = false;
    await _engine.stop();
    await _player.stop();
    await _recognizer.stop();
    setState(() => _waitingForUser = false);
  }

  void _advanceMine() {
    _recognizer.stop();
    if (_index < lines.length) _index++;
    _run();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _jump(int delta) async {
    await _pause();
    setState(() => _index = (_index + delta).clamp(0, lines.length - 1));
  }

  Future<void> _restart() async {
    await _pause();
    setState(() => _index = 0);
  }

  @override
  Widget build(BuildContext context) {
    final atEnd = _index >= lines.length;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.title),
        actions: [
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
              if (_handsFree && _waitingForUser) {
                _listenForMyLine();
              } else if (!_handsFree) {
                _recognizer.stop();
              }
            },
          ),
          IconButton(icon: const Icon(Icons.replay), onPressed: _restart, tooltip: '頭出し'),
        ],
      ),
      body: Stack(
        children: [
          Column(
            children: [
              LinearProgressIndicator(
                value: lines.isEmpty ? 0 : (_index.clamp(0, lines.length)) / lines.length,
              ),
              _buildModeSwitch(),
              Expanded(child: _showScript ? _buildScriptView() : _buildMemorizeView()),
              if (_waitingForUser) _buildYourTurnBanner(),
              if (atEnd) _buildEndBanner(),
              _buildControls(atEnd),
            ],
          ),
          if (_preparing) _buildPreparingOverlay(),
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
        onSelectionChanged: (set) => setState(() => _showScript = set.first),
      ),
    );
  }

  Widget _buildPreparingOverlay() {
    final pct = _prepTotal == 0 ? 0.0 : _prepDone / _prepTotal;
    return Container(
      color: AppColors.stage900.withValues(alpha: 0.6),
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(AppSpacing.xl),
          padding: const EdgeInsets.all(AppSpacing.xl),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.lg),
            boxShadow: AppShadows.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.graphic_eq, color: AppColors.primary, size: 32),
              const SizedBox(height: AppSpacing.md),
              Text('音声を準備中…',
                  style: AppText.body.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('本番の待ち時間をなくすため、先に合成しています',
                  style: AppText.caption, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.lg),
              SizedBox(
                width: 200,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  child: LinearProgressIndicator(
                      value: _prepTotal == 0 ? null : pct, minHeight: 8),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(_prepTotal == 0 ? '' : '$_prepDone / $_prepTotal', style: AppText.caption),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildScriptView() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: lines.length,
      itemBuilder: (context, i) {
        final l = lines[i];
        final current = i == _index;
        final mine = _isMine(l);
        final isDirection = l.type == LineType.direction;

        return Container(
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
              if (!isDirection)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: _speakerBadge(l.speaker ?? '', mine),
                ),
              Text(
                l.text,
                style: isDirection
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

  /// 話者バッジ（pill）。自分の役はアンバー、相手はインディゴ/ピンク系。
  Widget _speakerBadge(String speaker, bool mine) {
    final bg = mine
        ? AppColors.accent050
        : (speaker.isNotEmpty && speaker.hashCode.isEven
            ? AppColors.roleHanakoBg
            : AppColors.roleTaroBg);
    final fg = mine
        ? AppColors.accent600
        : (speaker.isNotEmpty && speaker.hashCode.isEven
            ? AppColors.roleHanakoFg
            : AppColors.roleTaroFg);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(
        '$speaker${mine ? '（あなた）' : ''}',
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: fg),
      ),
    );
  }

  /// 暗記モード：台本本文を隠し、相手の音声と最小限の手がかりだけ表示（舞台ダーク）。
  Widget _buildMemorizeView() {
    final line = (_index < lines.length) ? lines[_index] : null;
    final mine = line != null && _isMine(line);
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
              Text('${_index.clamp(0, lines.length)} / ${lines.length}',
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
                onPressed: () => setState(() => _peek = !_peek),
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
    final line = (_index < lines.length) ? lines[_index] : null;
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
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(_recognizer.isListening ? Icons.mic : Icons.mic_none,
                    size: 18, color: AppColors.accent600),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    _heard.isEmpty ? '聞き取り中…（言い終わると自動で進みます）' : _heard,
                    style: AppText.caption,
                  ),
                ),
              ],
            ),
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
            if (_running)
              FilledButton.icon(
                onPressed: _pause,
                icon: const Icon(Icons.pause),
                label: const Text('一時停止'),
              )
            else
              FilledButton.icon(
                onPressed: (atEnd || _preparing) ? null : _run,
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
