import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:record/record.dart';

import '../audio/read_through.dart';
import '../audio/read_through_store.dart';
import '../models/script.dart';
import '../theme/app_theme.dart';
import '../theme/role_colors.dart';

/// 通し録音：共演者との本読みをまるごと録音し、行の切れ目をタップで記録する。
///
/// 練習ではこの録音から各行の**実際の声**を再生し、行間の**間（ま）**も
/// 録音どおりに再現される（本人たちの掛け合いのテンポで返ってくる）。
/// 切れ目のタップはおおまかでよい：録音中の音量ログから「声が途切れた瞬間」を
/// 割り出して言い終わりを精密化する。録音は端末内にのみ保存。
class ReadThroughScreen extends StatefulWidget {
  const ReadThroughScreen({super.key, required this.script});

  final Script script;

  @override
  State<ReadThroughScreen> createState() => _ReadThroughScreenState();
}

class _ReadThroughScreenState extends State<ReadThroughScreen> {
  final _store = ReadThroughStore();
  final _recorder = AudioRecorder();
  final _player = AudioPlayer();

  ({ReadThroughData data, String audioPath})? _existing;
  bool _playing = false;

  // ---- 録音中の状態 ----
  bool _recording = false;
  final Stopwatch _clock = Stopwatch();
  final List<({String lineId, int tapMs})> _taps = [];
  final List<AmplitudeSample> _amps = [];
  StreamSubscription<Amplitude>? _ampSub;
  final ScrollController _scroll = ScrollController();

  Script get s => widget.script;

  /// タップで切れ目を付ける対象（メタ情報以外の全行。ト書きも読むなら含めて
  /// タップし、読まないならすぐ二度タップで飛ばせばよい）。
  late final List<Line> _lines =
      s.lines.where((l) => l.type != LineType.meta).toList();

  /// 次にタップする行のインデックス。
  int get _cursor => _taps.length;

  @override
  void initState() {
    super.initState();
    _load();
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _playing = false);
    });
  }

  Future<void> _load() async {
    final rt = await _store.load(s.id);
    if (mounted) setState(() => _existing = rt);
  }

  @override
  void dispose() {
    // 録音しっぱなしで画面を離れたら破棄（区間データが無い音声は使われない）。
    if (_recording) _recorder.stop().catchError((_) => null);
    _ampSub?.cancel();
    _recorder.dispose();
    _player.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _startRecording() async {
    if (_existing != null) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('録り直しますか？'),
          content: const Text('前回の通し録音は削除されます。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('録り直す'),
            ),
          ],
        ),
      );
      if (ok != true) return;
    }
    await _player.stop();
    try {
      if (!await _recorder.hasPermission()) {
        _snack('マイクの使用を許可してください。');
        return;
      }
      await _store.delete(s.id);
      final path = await _store.audioPath(s.id, create: true);
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path,
      );
      _taps.clear();
      _amps.clear();
      _clock
        ..reset()
        ..start();
      // 音量ログ：言い終わり（声が途切れた瞬間）の割り出しに使う。
      _ampSub = _recorder
          .onAmplitudeChanged(const Duration(milliseconds: 120))
          .listen(
        (a) => _amps.add(AmplitudeSample(_clock.elapsedMilliseconds, a.current)),
        onError: (_) {}, // 音量が取れない端末でも録音自体は続ける
      );
      setState(() {
        _existing = null;
        _recording = true;
      });
    } catch (_) {
      _snack('録音を開始できませんでした。');
    }
  }

  /// いま _cursor の行を言い始めた瞬間のタップ。
  void _tapLine() {
    if (!_recording || _cursor >= _lines.length) return;
    _taps.add((lineId: _lines[_cursor].id, tapMs: _clock.elapsedMilliseconds));
    setState(() {});
    _scrollToCursor();
  }

  /// タップの取り消し（押し間違い・行の飛ばし過ぎ対応）。
  void _undoTap() {
    if (!_recording || _taps.isEmpty) return;
    _taps.removeLast();
    setState(() {});
    _scrollToCursor();
  }

  Future<void> _stopRecording() async {
    if (!_recording) return;
    _clock.stop();
    final totalMs = _clock.elapsedMilliseconds;
    await _ampSub?.cancel();
    _ampSub = null;
    try {
      await _recorder.stop();
    } catch (_) {}
    setState(() => _recording = false);

    if (_taps.isEmpty) {
      await _store.delete(s.id); // 切れ目ゼロの録音は使えないので残さない
      _snack('切れ目がタップされていないため保存しませんでした。');
      return;
    }
    final segments = buildSegments(
      taps: _taps,
      amplitudes: _amps,
      totalMs: totalMs,
    );
    await _store.save(
      s.id,
      ReadThroughData(segments: segments, recordedAt: DateTime.now()),
    );
    await _load();
    final voiced = segments.where((seg) => seg.hasVoice).length;
    _snack('保存しました（$voiced行に声を検出）。練習でこの声と間が使われます。');
  }

  Future<void> _togglePlayback() async {
    final rt = _existing;
    if (rt == null) return;
    if (_playing) {
      await _player.stop();
      setState(() => _playing = false);
      return;
    }
    try {
      setState(() => _playing = true);
      await _player.play(DeviceFileSource(rt.audioPath));
    } catch (_) {
      setState(() => _playing = false);
      _snack('再生できませんでした。');
    }
  }

  Future<void> _deleteTake() async {
    await _player.stop();
    await _store.delete(s.id);
    await _load();
    _snack('通し録音を削除しました。練習は合成音声に戻ります。');
  }

  void _scrollToCursor() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      const estimatedExtent = 76.0;
      final target = (_cursor * estimatedExtent - 140)
          .clamp(0.0, _scroll.position.maxScrollExtent);
      _scroll.animateTo(
        target,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('通し録音')),
      body: Column(
        children: [
          if (!_recording) _headerCard(),
          if (_recording) _recordingBanner(),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: ListView.separated(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xl),
              itemCount: _lines.length,
              separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
              itemBuilder: (context, i) => _lineTile(i),
            ),
          ),
          _bottomBar(),
        ],
      ),
    );
  }

  Widget _headerCard() {
    final rt = _existing;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            rt == null
                ? '共演者との本読みをまるごと録音します。それぞれのセリフを言い始めた瞬間に'
                    '下のボタンをタップしてください（おおまかでOK）。練習では録音した声で'
                    '相手が返り、掛け合いの「間」もそのまま再現されます（録音は端末内のみ）。'
                : '通し録音があります。練習ではこの録音の声と「間」が使われます。',
            style: AppText.caption,
          ),
          if (rt != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(
                    color: AppColors.accent600.withValues(alpha: 0.5)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.graphic_eq, color: AppColors.accent600),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      '${rt.data.segments.where((seg) => seg.hasVoice).length}行に声あり'
                      '（全${rt.data.segments.length}行に切れ目）',
                      style: AppText.body,
                    ),
                  ),
                  IconButton(
                    icon: Icon(_playing ? Icons.stop : Icons.play_arrow,
                        color: AppColors.primary600),
                    tooltip: _playing ? '停止' : '全体を試聴',
                    onPressed: _togglePlayback,
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete_outline,
                        color: AppColors.ink500),
                    tooltip: '削除',
                    onPressed: _deleteTake,
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _recordingBanner() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.danger),
      ),
      child: Row(
        children: [
          const Icon(Icons.fiber_manual_record, color: AppColors.danger, size: 16),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              _cursor < _lines.length
                  ? '録音中 — 次のセリフを言い始めた瞬間にタップ（${_cursor + 1}/${_lines.length}）'
                  : '録音中 — 最後まで読み終わったら停止してください',
              style: AppText.body.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Widget _lineTile(int i) {
    final line = _lines[i];
    final isDirection = line.type == LineType.direction;
    final done = i < _cursor;
    final isNext = _recording && i == _cursor;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: isNext
            ? AppColors.primary050
            : done
                ? AppColors.surface
                : AppColors.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(
          color: isNext
              ? AppColors.primary
              : done
                  ? AppColors.accent600.withValues(alpha: 0.4)
                  : AppColors.line,
          width: isNext ? 2 : 1,
        ),
      ),
      child: Row(
        children: [
          if (done)
            const Padding(
              padding: EdgeInsets.only(right: AppSpacing.sm),
              child: Icon(Icons.check_circle,
                  color: AppColors.accent600, size: 18),
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!isDirection && line.speaker != null) ...[
                  _speakerBadge(line.speaker!),
                  const SizedBox(height: 4),
                ],
                Text(
                  line.text,
                  style: isDirection
                      ? AppText.body.copyWith(
                          fontStyle: FontStyle.italic, color: AppColors.ink500)
                      : AppText.body,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _speakerBadge(String speaker) {
    final c = roleColors(s.characters.indexOf(speaker));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Text(speaker,
          style: AppText.caption
              .copyWith(color: c.fg, fontWeight: FontWeight.w800)),
    );
  }

  Widget _bottomBar() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: !_recording
            ? SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _startRecording,
                  icon: const Icon(Icons.mic),
                  label: Text(_existing == null ? '通し録音を始める' : '録り直す'),
                ),
              )
            : Row(
                children: [
                  IconButton.outlined(
                    onPressed: _taps.isEmpty ? null : _undoTap,
                    tooltip: '1つ戻す',
                    icon: const Icon(Icons.undo),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: FilledButton(
                      onPressed: _cursor < _lines.length ? _tapLine : null,
                      style: FilledButton.styleFrom(
                        padding:
                            const EdgeInsets.symmetric(vertical: AppSpacing.lg),
                      ),
                      child: Text(
                        _cursor < _lines.length
                            ? '▶ このセリフを言い始めた'
                            : '全行マーク済み',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  FilledButton.tonalIcon(
                    onPressed: _stopRecording,
                    icon: const Icon(Icons.stop),
                    label: const Text('停止'),
                  ),
                ],
              ),
      ),
    );
  }
}
