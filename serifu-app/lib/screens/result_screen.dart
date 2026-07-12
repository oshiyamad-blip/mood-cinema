import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../ads/ads.dart';
import '../audio/my_take_store.dart';
import '../models/script.dart';
import '../rehearsal/take_recorder.dart';
import '../theme/app_theme.dart';
import 'rehearsal_screen.dart';

/// 練習終了後のリザルト画面。
///
/// 広告ポリシー：練習「中」ではなくなったこの画面にのみ、
/// ホームと同じ控えめなバナーを下部に1枠置く（無視して操作できる配置。
/// ボタン群とは離し、読み込めない場合は何も出ない）。
class ResultScreen extends StatefulWidget {
  const ResultScreen({
    super.key,
    required this.script,
    required this.duration,
    required this.listenMode,
    this.stuck = const [],
  });

  final Script script;
  final Duration duration;
  final bool listenMode;

  /// 詰まった可能性の高いセリフ（確度順）。聞き流しモードでは常に空。
  final List<StuckLine> stuck;

  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  Script get script => widget.script;
  Duration get duration => widget.duration;
  bool get listenMode => widget.listenMode;
  List<StuckLine> get stuck => widget.stuck;

  /// この練習で自動録音された自分のセリフ（lineId → パス）。
  Map<String, String> _myTakes = {};
  final AudioPlayer _takePlayer = AudioPlayer();
  String? _playingLineId;

  @override
  void initState() {
    super.initState();
    MyTakeStore().loadAll(script.id).then((map) {
      if (mounted && map.isNotEmpty) setState(() => _myTakes = map);
    });
    _takePlayer.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _playingLineId = null);
    });
  }

  @override
  void dispose() {
    _takePlayer.dispose();
    super.dispose();
  }

  /// 自分の演技の再生/停止（つまずいた行の聞き返し）。
  Future<void> _togglePlay(String lineId) async {
    if (_playingLineId == lineId) {
      await _takePlayer.stop();
      setState(() => _playingLineId = null);
      return;
    }
    final path = _myTakes[lineId];
    if (path == null) return;
    await _takePlayer.stop();
    setState(() => _playingLineId = lineId);
    try {
      await _takePlayer.play(DeviceFileSource(path));
    } catch (_) {
      if (mounted) setState(() => _playingLineId = null);
    }
  }

  String get _durationLabel {
    final m = duration.inMinutes;
    final sec = duration.inSeconds % 60;
    return m > 0 ? '$m分$sec秒' : '$sec秒';
  }

  @override
  Widget build(BuildContext context) {
    final myLines = script.lines
        .where((l) =>
            l.type == LineType.dialogue && l.speaker == script.myCharacter)
        .length;
    final allDialogue =
        script.lines.where((l) => l.type == LineType.dialogue).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('練習おつかれさまでした'),
        automaticallyImplyLeading: false,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          const SizedBox(height: AppSpacing.md),
          const Center(child: Text('🎭', style: TextStyle(fontSize: 56))),
          const SizedBox(height: AppSpacing.md),
          Center(
            child: Text(
              script.title,
              style: AppText.h1,
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Center(
            child: Text(
              listenMode ? '聞き流しモードで通し終えました' : '最後まで通せました',
              style: AppText.body.copyWith(color: AppColors.ink500),
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          Row(
            children: [
              _StatCard(label: '所要時間', value: _durationLabel),
              const SizedBox(width: AppSpacing.md),
              _StatCard(
                label: listenMode ? 'セリフ数' : '自分のセリフ',
                value: listenMode ? '$allDialogue行' : '$myLines行',
              ),
            ],
          ),
          if (stuck.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xl),
            _StuckSection(
              stuck: stuck,
              myTakes: _myTakes,
              playingLineId: _playingLineId,
              onTogglePlay: _togglePlay,
            ),
            const SizedBox(height: AppSpacing.md),
            // つまずいた行＋直前のキューだけを反復する部分練習。
            FilledButton.tonalIcon(
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52)),
              onPressed: () => Navigator.of(context).pushReplacement(
                MaterialPageRoute(
                  builder: (_) => RehearsalScreen(
                    script: script,
                    focusLines: buildFocusLines(script.lines, stuck),
                  ),
                ),
              ),
              icon: const Icon(Icons.repeat),
              label: const Text('つまずいたところだけ練習'),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: () => Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => RehearsalScreen(script: script)),
            ),
            icon: const Icon(Icons.replay),
            label: const Text('もう一度練習する'),
          ),
          const SizedBox(height: AppSpacing.md),
          OutlinedButton(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('台本に戻る'),
          ),
        ],
      ),
      // 練習終了後のみ。ホームと同じ無視できるバナー（読み込み失敗時は高さ0）。
      bottomNavigationBar: const AdBanner(),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.md),
          boxShadow: AppShadows.sm,
        ),
        child: Column(
          children: [
            Text(label, style: AppText.caption),
            const SizedBox(height: AppSpacing.xs),
            Text(value, style: AppText.h1.copyWith(color: AppColors.primary600)),
          ],
        ),
      ),
    );
  }
}

/// 「詰まったかも」一覧。芝居の間との区別は完全ではないため断定しない。
class _StuckSection extends StatelessWidget {
  const _StuckSection({
    required this.stuck,
    required this.myTakes,
    required this.playingLineId,
    required this.onTogglePlay,
  });

  final List<StuckLine> stuck;

  /// 自分のセリフの自動録音（lineId → パス）。あれば行に再生ボタンを出す。
  final Map<String, String> myTakes;
  final String? playingLineId;
  final void Function(String lineId) onTogglePlay;

  String _reasonLabel(StuckReason r) => switch (r) {
        StuckReason.peeked => 'チラ見',
        StuckReason.manyRetries => '言い直し',
        StuckReason.slow => '時間がかかった',
      };

  Color _reasonColor(StuckReason r) => switch (r) {
        StuckReason.peeked => AppColors.accent600,
        StuckReason.manyRetries => AppColors.primary600,
        StuckReason.slow => AppColors.ink500,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: AppShadows.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('つまずいたかも？', style: AppText.h2),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '時間がかかった・チラ見したセリフです。役作りの「間」なら気にしないでください。',
            style: AppText.caption,
          ),
          const SizedBox(height: AppSpacing.md),
          for (final item in stuck) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: _reasonColor(item.reason).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Text(
                    _reasonLabel(item.reason),
                    style: AppText.caption.copyWith(
                      color: _reasonColor(item.reason),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    '「${item.line.text}」',
                    style: AppText.body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ],
      ),
    );
  }
}
