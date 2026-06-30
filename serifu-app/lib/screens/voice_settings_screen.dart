import 'package:flutter/material.dart';

import '../billing/features.dart';
import '../data/script_repository.dart';
import '../models/script.dart';
import '../speech/device_speech_engine.dart';
import '../speech/speech_engine.dart';
import '../theme/app_theme.dart';
import 'paywall_screen.dart';

/// 役ごとの声設定（声モデル・性別・テンポ）。試聴つき。
///
/// 端末に搭載されている日本語ボイス（声モデル）を一覧し、役ごとに選べる。
/// 利用可能なボイス数は端末・OS・追加ダウンロード状況で変わる。
class VoiceSettingsScreen extends StatefulWidget {
  const VoiceSettingsScreen({super.key, required this.script});
  final Script script;

  @override
  State<VoiceSettingsScreen> createState() => _VoiceSettingsScreenState();
}

class _VoiceSettingsScreenState extends State<VoiceSettingsScreen> {
  final SpeechEngine _engine = DeviceSpeechEngine();
  List<TtsVoice> _voices = [];
  bool _loading = true;

  // 役ごとのアバター配色（home_screen と同系統のパレット）。
  static const _avatarPalette = [
    (AppColors.roleTaroBg, AppColors.roleTaroFg),
    (AppColors.roleHanakoBg, AppColors.roleHanakoFg),
    (AppColors.primary100, AppColors.primary700),
    (AppColors.accent050, AppColors.accent600),
  ];

  @override
  void initState() {
    super.initState();
    _loadVoices();
  }

  Future<void> _loadVoices() async {
    try {
      final v = await _engine.voices('ja-JP');
      if (!mounted) return;
      setState(() {
        _voices = v;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _engine.dispose();
    ScriptRepository.instance.touch(); // 声設定を保存
    super.dispose();
  }

  Future<void> _preview(VoiceProfile p) async {
    await _engine.speak('これはテスト用の試聴です。テンポはこのくらいです。', p);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.script;
    final others = s.characters.where((c) => c != s.myCharacter).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('相手役の声設定')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : others.isEmpty
              ? const Center(
                  child: Text('相手役がいません', style: AppText.body),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.xxl),
                  children: [
                    _voiceCountPill(),
                    const SizedBox(height: AppSpacing.lg),
                    for (var i = 0; i < others.length; i++) ...[
                      _buildCharacter(s, others[i], i),
                      if (i != others.length - 1)
                        const SizedBox(height: AppSpacing.lg),
                    ],
                  ],
                ),
    );
  }

  /// 「この端末で使える声モデル：N個」をピル表示。
  Widget _voiceCountPill() {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm + 2),
      decoration: BoxDecoration(
        color: AppColors.primary050,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: AppColors.primary100),
      ),
      child: Row(
        children: [
          const Icon(Icons.lock_outline, size: 16, color: AppColors.primary700),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text.rich(
              TextSpan(
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary700,
                ),
                children: [
                  const TextSpan(text: 'この端末で使える声モデル：'),
                  TextSpan(
                    text: '${_voices.length}個',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                  ),
                  const TextSpan(text: '（オフライン・端末内蔵）'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCharacter(Script s, String c, int index) {
    final p = s.voiceFor(c);
    // 性別で絞った候補（gender情報が無い声は常に候補に含める）。
    final candidates =
        _voices.where((v) => v.gender == null || v.gender == p.gender).toList();

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: AppShadows.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 役ヘッダー：アバターバッジ + 役名 + 「相手役」ラベル + 試聴。
          Row(
            children: [
              _avatar(c, index),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c, style: AppText.h2),
                    const Text('相手役', style: AppText.caption),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.volume_up_outlined, color: AppColors.primary600),
                tooltip: '試聴',
                onPressed: () => _preview(p),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          // 性別
          _fieldLabel('性別'),
          SegmentedButton<Gender>(
            segments: const [
              ButtonSegment(value: Gender.female, label: Text('女性')),
              ButtonSegment(value: Gender.male, label: Text('男性')),
            ],
            selected: {p.gender},
            onSelectionChanged: (set) => setState(() {
              // 性別を変えたら、その性別の声モデル選択はリセット。
              s.voiceByCharacter[c] = p.copyWith(gender: set.first, voiceId: '');
            }),
          ),
          // 声モデル選択（プロ機能。未選択なら性別から自動）。
          if (_voices.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                _fieldLabel('声モデル'),
                if (!Features.voiceModelSelection) ...[
                  const SizedBox(width: AppSpacing.sm),
                  _proBadge(),
                ],
              ],
            ),
            if (Features.voiceModelSelection)
              Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  border: Border.all(color: AppColors.line, width: 1.5),
                ),
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    isExpanded: true,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                    icon: const Icon(Icons.expand_more, color: AppColors.ink300),
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink900,
                    ),
                    value: (p.voiceId != null && candidates.any((v) => v.id == p.voiceId))
                        ? p.voiceId
                        : '',
                    items: [
                      const DropdownMenuItem(value: '', child: Text('自動（性別から選択）')),
                      ...candidates.map(
                        (v) => DropdownMenuItem(
                            value: v.id,
                            child: Text(v.name, overflow: TextOverflow.ellipsis)),
                      ),
                    ],
                    onChanged: (v) => setState(() {
                      s.voiceByCharacter[c] = p.copyWith(voiceId: v ?? '');
                    }),
                  ),
                ),
              )
            else
              // 未加入：ロック表示。タップでペイウォールへ。
              InkWell(
                borderRadius: BorderRadius.circular(AppRadius.sm),
                onTap: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const PaywallScreen(reason: '声モデルの選択はプロの機能です'),
                    ),
                  );
                  // 購入後にロック解除を反映させるため再描画。
                  if (mounted) setState(() {});
                },
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.primary050,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                    border: Border.all(color: AppColors.primary100, width: 1.5),
                  ),
                  padding:
                      const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.md),
                  child: Row(
                    children: [
                      const Icon(Icons.lock_outline, size: 18, color: AppColors.primary600),
                      const SizedBox(width: AppSpacing.sm),
                      const Expanded(
                        child: Text('自動（性別から選択）',
                            style: TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink900)),
                      ),
                      Text('プロで選択', style: AppText.caption.copyWith(color: AppColors.primary600)),
                    ],
                  ),
                ),
              ),
          ],
          const SizedBox(height: AppSpacing.lg),
          // テンポ（速度）
          Row(
            children: [
              _fieldLabel('テンポ（速度）'),
              const Spacer(),
              Text(
                '${p.rate.toStringAsFixed(1)}×',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary600,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Slider(
            min: 0.5,
            max: 2.0,
            divisions: 15,
            label: '${p.rate.toStringAsFixed(1)}x',
            value: p.rate,
            onChanged: (v) => setState(() => s.voiceByCharacter[c] = p.copyWith(rate: v)),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('0.5×', style: AppText.caption),
                Text('1.0×', style: AppText.caption),
                Text('1.5×', style: AppText.caption),
                Text('2.0×', style: AppText.caption),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          // 試聴ボタン
          SizedBox(
            width: double.infinity,
            child: FilledButton.tonalIcon(
              onPressed: () => _preview(p),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('試聴する'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary100,
                foregroundColor: AppColors.primary700,
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// セクション内のフィールド見出し。
  Widget _fieldLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: AppColors.ink700,
        ),
      ),
    );
  }

  /// 「プロ」バッジ。
  Widget _proBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.accent050,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: const Text('プロ',
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.accent600)),
    );
  }

  /// 役名の頭文字を丸バッジ表示。
  Widget _avatar(String c, int index) {
    final (bg, fg) = _avatarPalette[index % _avatarPalette.length];
    final label = c.characters.isEmpty ? '?' : c.characters.first;
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Text(
        label,
        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: fg),
      ),
    );
  }
}
