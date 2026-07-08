import 'package:flutter/material.dart';

import '../ads/ads.dart';
import '../models/script.dart';
import '../theme/app_theme.dart';
import 'rehearsal_screen.dart';

/// 練習終了後のリザルト画面。
///
/// 広告ポリシー：練習「中」ではなくなったこの画面にのみ、
/// ホームと同じ控えめなバナーを下部に1枠置く（無視して操作できる配置。
/// ボタン群とは離し、読み込めない場合は何も出ない）。
class ResultScreen extends StatelessWidget {
  const ResultScreen({
    super.key,
    required this.script,
    required this.duration,
    required this.listenMode,
  });

  final Script script;
  final Duration duration;
  final bool listenMode;

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
