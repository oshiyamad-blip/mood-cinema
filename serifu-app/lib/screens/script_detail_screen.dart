import 'package:flutter/material.dart';

import '../data/script_repository.dart';
import '../models/script.dart';
import '../theme/app_theme.dart';
import 'rehearsal_screen.dart';
import 'script_edit_screen.dart';
import 'voice_settings_screen.dart';

/// 台本詳細：自分の役の選択、ト書きON/OFF、声設定、練習開始。
class ScriptDetailScreen extends StatefulWidget {
  const ScriptDetailScreen({super.key, required this.script});
  final Script script;

  @override
  State<ScriptDetailScreen> createState() => _ScriptDetailScreenState();
}

class _ScriptDetailScreenState extends State<ScriptDetailScreen> {
  Script get s => widget.script;

  /// セクション見出し：左に4pxのインディゴバー＋太字。
  Widget _sectionHeading(String text, {Widget? trailing}) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(text, style: AppText.h2),
        if (trailing != null) ...[
          const Spacer(),
          trailing,
        ],
      ],
    );
  }

  /// コンテンツを囲む「セクション」カード。
  Widget _section({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: AppShadows.sm,
      ),
      child: child,
    );
  }

  /// 「必須」バッジ。
  Widget _requiredBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.accent050,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: const Text(
        '必須',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.accent600,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(s.title),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_note),
            tooltip: '解析結果を修正',
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => ScriptEditScreen(script: s)),
              );
              ScriptRepository.instance.touch(); // 修正を保存
              if (mounted) setState(() {});
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          // ヒーロー：タイトル＋ステータス。
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.xl),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.primary, AppColors.primary700],
              ),
              borderRadius: BorderRadius.circular(AppRadius.lg),
              boxShadow: AppShadows.md,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  s.title,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    _heroStat('${s.characters.length}', '登場人物'),
                    const SizedBox(width: AppSpacing.xl),
                    _heroStat('${s.lines.length}', '行'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // あなたの役。
          _section(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionHeading('あなたの役', trailing: _requiredBadge()),
                const SizedBox(height: AppSpacing.md),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: s.characters.map((c) {
                    final selected = s.myCharacter == c;
                    return ChoiceChip(
                      label: Text(c),
                      selected: selected,
                      onSelected: (_) {
                        setState(() => s.myCharacter = c);
                        ScriptRepository.instance.touch();
                      },
                    );
                  }).toList(),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  '選んだ役はあなたが演じます。残りの役をアプリが読み上げます。',
                  style: AppText.caption,
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // ト書き。
          _section(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionHeading('ト書きの読み上げ'),
                const SizedBox(height: AppSpacing.xs),
                SwitchListTile(
                  title: const Text('ト書きを読み上げる'),
                  subtitle: const Text('OFFにすると画面表示のみ'),
                  value: s.readDirections,
                  contentPadding: EdgeInsets.zero,
                  onChanged: (v) {
                    setState(() => s.readDirections = v);
                    ScriptRepository.instance.touch();
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // 声設定。
          _section(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionHeading('相手役の声設定'),
                const SizedBox(height: AppSpacing.xs),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: AppColors.primary050,
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                    ),
                    child: const Icon(
                      Icons.record_voice_over_outlined,
                      color: AppColors.primary,
                    ),
                  ),
                  title: const Text('相手役の声設定'),
                  subtitle: const Text('役ごとに 男性/女性・テンポ'),
                  trailing: const Icon(Icons.chevron_right, color: AppColors.ink300),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => VoiceSettingsScreen(script: s)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xl),

          // 練習開始：幅いっぱい。
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: s.myCharacter == null
                  ? null
                  : () {
                      s.lastPracticedAt = DateTime.now();
                      ScriptRepository.instance.touch();
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => RehearsalScreen(script: s)),
                      );
                    },
              icon: const Icon(Icons.play_arrow),
              label: Text(s.myCharacter == null ? 'まず自分の役を選んでください' : '練習開始'),
            ),
          ),
        ],
      ),
    );
  }

  /// ヒーロー内の統計（数値＋ラベル）。
  Widget _heroStat(String n, String l) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          n,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
        Text(
          l,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Colors.white.withValues(alpha: 0.85),
          ),
        ),
      ],
    );
  }
}
