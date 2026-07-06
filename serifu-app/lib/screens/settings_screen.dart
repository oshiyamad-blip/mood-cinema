import 'package:flutter/material.dart';

import '../billing/features.dart';
import '../billing/purchase_service.dart';
import '../data/settings_store.dart';
import '../models/app_settings.dart';
import '../models/script.dart';
import '../theme/app_theme.dart';
import 'paywall_screen.dart';

/// 設定画面：既定の声・ト書き・自動進行・クラウド音声・プラン・データ取り扱い。
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _store = SettingsStore.instance;

  AppSettings get s => _store.settings;
  void _save(AppSettings next) => setState(() => _store.update(next));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('設定')),
      body: AnimatedBuilder(
        animation: PurchaseService.instance,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            _defaultVoiceSection(),
            const SizedBox(height: AppSpacing.md),
            _directionsSection(),
            const SizedBox(height: AppSpacing.md),
            _autoAdvanceSection(),
            const SizedBox(height: AppSpacing.md),
            _recognitionSection(),
            const SizedBox(height: AppSpacing.md),
            _cloudVoiceSection(),
            const SizedBox(height: AppSpacing.md),
            _planSection(),
            const SizedBox(height: AppSpacing.md),
            _privacySection(),
          ],
        ),
      ),
    );
  }

  Widget _card({required Widget child}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.md),
          boxShadow: AppShadows.sm,
        ),
        child: child,
      );

  Widget _heading(String text, {Widget? trailing}) => Row(
        children: [
          Container(
            width: 4,
            height: 16,
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(text, style: AppText.h2),
          if (trailing != null) ...[const Spacer(), trailing],
        ],
      );

  Widget _defaultVoiceSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('既定の声（新しい台本の相手役）'),
          const SizedBox(height: AppSpacing.md),
          SegmentedButton<Gender>(
            segments: const [
              ButtonSegment(value: Gender.female, label: Text('女性')),
              ButtonSegment(value: Gender.male, label: Text('男性')),
            ],
            selected: {s.defaultGender},
            onSelectionChanged: (set) => _save(s.copyWith(defaultGender: set.first)),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              const Text('テンポ'),
              Expanded(
                child: Slider(
                  min: 0.5,
                  max: 2.0,
                  divisions: 15,
                  label: '${s.defaultRate.toStringAsFixed(1)}x',
                  value: s.defaultRate,
                  onChanged: (v) => _save(s.copyWith(defaultRate: v)),
                ),
              ),
              SizedBox(width: 40, child: Text('${s.defaultRate.toStringAsFixed(1)}x')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _directionsSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('ト書きの既定'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('新しい台本でト書きを読み上げる'),
            value: s.defaultReadDirections,
            onChanged: (v) => _save(s.copyWith(defaultReadDirections: v)),
          ),
        ],
      ),
    );
  }

  Widget _autoAdvanceSection() {
    final sec = s.autoAdvanceSeconds;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('自分の番の自動進行'),
          const SizedBox(height: AppSpacing.xs),
          Text(
            sec == 0 ? '手動（「言えた・次へ」で進む）' : '$sec 秒後に自動で次へ',
            style: AppText.caption,
          ),
          Row(
            children: [
              const Text('手動'),
              Expanded(
                child: Slider(
                  min: 0,
                  max: 10,
                  divisions: 10,
                  label: sec == 0 ? '手動' : '$sec秒',
                  value: sec.toDouble(),
                  onChanged: (v) => _save(s.copyWith(autoAdvanceSeconds: v.round())),
                ),
              ),
              const Text('10秒'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _recognitionSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('音声認識（ハンズフリー）'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('高精度認識を使う'),
            subtitle: Text(
              'OSのクラウド音声認識を許可して認識精度を上げます。'
              'ONにするとセリフの音声が端末外の認識サービスへ送信される場合があります。'
              'OFF（推奨）では可能な限り端末内で認識します。',
              style: AppText.caption,
            ),
            value: s.highAccuracyRecognition,
            onChanged: (v) => _save(s.copyWith(highAccuracyRecognition: v)),
          ),
        ],
      ),
    );
  }

  Widget _cloudVoiceSection() {
    final pro = Features.cloudVoices;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('クラウド高品質音声', trailing: pro ? null : _proBadge()),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('より自然な音声を使う'),
            subtitle: Text(
              pro
                  ? 'エンドポイント設定時に有効（未設定なら端末音声）'
                  : 'プロにアップグレードすると使えます',
              style: AppText.caption,
            ),
            value: s.useCloudVoices && pro,
            onChanged: (v) async {
              if (!pro) {
                await Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const PaywallScreen(reason: 'クラウド高品質音声はプロの機能です'),
                  ),
                );
                if (mounted) setState(() {});
                return;
              }
              _save(s.copyWith(useCloudVoices: v));
            },
          ),
        ],
      ),
    );
  }

  Widget _planSection() {
    final pro = Features.isPro;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('プラン'),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Icon(pro ? Icons.workspace_premium : Icons.workspace_premium_outlined,
                  color: pro ? AppColors.accent600 : AppColors.primary600),
              const SizedBox(width: AppSpacing.sm),
              Text(pro ? 'プロ利用中' : '無料プラン', style: AppText.body),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          if (!pro)
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const PaywallScreen()),
                  );
                  if (mounted) setState(() {});
                },
                child: const Text('プロにアップグレード'),
              ),
            ),
          TextButton(
            onPressed: () async {
              final ok = await PurchaseService.instance.restore();
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(ok ? '購入を復元しました。' : '復元できる購入がありませんでした。')),
              );
            },
            child: const Text('購入を復元'),
          ),
        ],
      ),
    );
  }

  Widget _privacySection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('データの取り扱い'),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '台本の抽出・解析・読み上げは端末内で行い、クラウドへ送信しません。'
            'したがって台本データがAIの学習に使われることはありません。'
            'ハンズフリーの音声認識は可能な限り端末内で行います。'
            'クラウド高品質音声を有効にした場合のみ、対象のセリフが音声合成の'
            'ために送信されます（学習非利用のサービスを使用）。',
            style: AppText.caption,
          ),
        ],
      ),
    );
  }

  Widget _proBadge() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
          color: AppColors.accent050,
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
        child: const Text('プロ',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.accent600)),
      );
}
