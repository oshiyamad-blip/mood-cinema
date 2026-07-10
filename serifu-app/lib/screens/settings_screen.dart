import 'package:flutter/material.dart';

import '../data/settings_store.dart';
import '../models/app_settings.dart';
import '../models/script.dart';
import '../speech/cloud_tts_client.dart';
import '../theme/app_theme.dart';
import 'legal_screen.dart';

/// 設定画面：既定の声・ト書き・自動進行・データ取り扱い。
/// （完全無料＋広告モデルのため、プラン/課金の項目は表示しない。
///   クラウド高品質音声はエンドポイント設定済みビルドでのみ表示。）
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
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          _defaultVoiceSection(),
          const SizedBox(height: AppSpacing.md),
          _directionsSection(),
          const SizedBox(height: AppSpacing.md),
          _autoAdvanceSection(),
          const SizedBox(height: AppSpacing.md),
          _replyPauseSection(),
          const SizedBox(height: AppSpacing.md),
          _recognitionSection(),
          // クラウド音声は自前エンドポイントを設定したビルドでのみ表示
          // （通常ビルドでは費用のかかる外部APIは一切使わない）。
          if (CloudTtsConfig.configured) ...[
            const SizedBox(height: AppSpacing.md),
            _cloudVoiceSection(),
          ],
          const SizedBox(height: AppSpacing.md),
          _privacySection(),
        ],
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

  Widget _replyPauseSection() {
    final millis = s.replyPauseMillis;
    final sec = millis / 1000;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('返しの間（相手が返すまで）'),
          const SizedBox(height: AppSpacing.xs),
          Text(
            millis == 0
                ? 'すぐに返す（間なし）'
                : '話し終わってから合計${sec.toStringAsFixed(1)}秒で相手が返します'
                    '（通し録音がある台本では録音した間が優先されます）',
            style: AppText.caption,
          ),
          Row(
            children: [
              const Text('すぐ'),
              Expanded(
                child: Slider(
                  min: 0,
                  max: 3000,
                  divisions: 30, // 0.1秒刻み
                  label: millis == 0 ? 'すぐ' : '${sec.toStringAsFixed(1)}秒',
                  value: millis.toDouble(),
                  onChanged: (v) =>
                      _save(s.copyWith(replyPauseMillis: (v / 100).round() * 100)),
                ),
              ),
              const Text('3秒'),
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
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('クラウド高品質音声'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('より自然な音声を使う'),
            subtitle: Text(
              'このビルドに設定されたエンドポイントで合成します（台本は学習に使われません）',
              style: AppText.caption,
            ),
            value: s.useCloudVoices,
            onChanged: (v) => _save(s.copyWith(useCloudVoices: v)),
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
          const SizedBox(height: AppSpacing.sm),
          TextButton.icon(
            style: TextButton.styleFrom(padding: EdgeInsets.zero),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const LegalScreen()),
            ),
            icon: const Icon(Icons.gavel_outlined, size: 18),
            label: const Text('プライバシーポリシー・利用規約'),
          ),
        ],
      ),
    );
  }

}
