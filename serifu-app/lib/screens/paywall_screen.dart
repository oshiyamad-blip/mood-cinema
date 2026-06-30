import 'package:flutter/material.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import '../billing/purchase_service.dart';
import '../theme/app_theme.dart';

/// アップグレード（ペイウォール）画面。
///
/// 課金が未構成の環境では購入導線は出さず「準備中」を表示する
/// （アプリは無料層で動作する）。
class PaywallScreen extends StatefulWidget {
  const PaywallScreen({super.key, this.reason});

  /// どの機能から来たか（文言の出し分け用、任意）。
  final String? reason;

  @override
  State<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends State<PaywallScreen> {
  final _service = PurchaseService.instance;
  List<Package> _packages = [];
  bool _loading = true;
  bool _busy = false;

  static const _benefits = [
    ('台本を無制限に保存', Icons.all_inclusive),
    ('ハンズフリー進行（自動で相手役）', Icons.mic),
    ('声モデルを自由に選択', Icons.graphic_eq),
    ('高品質クラウド音声（近日）', Icons.auto_awesome),
    ('広告なし', Icons.block),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final pkgs = await _service.packages();
    if (!mounted) return;
    setState(() {
      _packages = pkgs;
      _loading = false;
    });
  }

  Future<void> _buy(Package package) async {
    setState(() => _busy = true);
    final ok = await _service.buy(package);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('プロにアップグレードしました。ありがとうございます！')));
    }
  }

  Future<void> _restore() async {
    setState(() => _busy = true);
    final ok = await _service.restore();
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ok ? '購入を復元しました。' : '復元できる購入がありませんでした。')),
    );
    if (ok) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('プロにアップグレード')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                _hero(),
                const SizedBox(height: AppSpacing.lg),
                _benefitsCard(),
                const SizedBox(height: AppSpacing.lg),
                if (_packages.isEmpty) _unavailable() else ..._packageCards(),
                const SizedBox(height: AppSpacing.md),
                Center(
                  child: TextButton(
                    onPressed: _busy ? null : _restore,
                    child: const Text('購入を復元'),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'サブスクは期間終了の24時間前までに解約しない限り自動更新されます。'
                  '購入の管理・解約はストアのアカウント設定から行えます。',
                  style: AppText.caption,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
    );
  }

  Widget _hero() {
    return Container(
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
          const Icon(Icons.workspace_premium, color: Colors.white, size: 32),
          const SizedBox(height: AppSpacing.sm),
          const Text('セリフ稽古 プロ',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
          const SizedBox(height: AppSpacing.xs),
          Text(
            widget.reason ?? '本気の稽古に。すべての機能を解放します。',
            style: const TextStyle(color: Colors.white70, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _benefitsCard() {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: AppShadows.sm,
      ),
      child: Column(
        children: [
          for (final b in _benefits)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.primary050,
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                    ),
                    child: Icon(b.$2, size: 18, color: AppColors.primary),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(child: Text(b.$1, style: AppText.body)),
                  const Icon(Icons.check, color: AppColors.success, size: 18),
                ],
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _packageCards() {
    return _packages.map((p) {
      final product = p.storeProduct;
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _busy ? null : () => _buy(p),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                children: [
                  Text(product.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(product.priceString, style: const TextStyle(fontSize: 13)),
                ],
              ),
            ),
          ),
        ),
      );
    }).toList();
  }

  Widget _unavailable() {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.accent050,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.accent200),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, color: AppColors.accent600),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text('現在、購入はご利用いただけません（準備中）。', style: AppText.body),
          ),
        ],
      ),
    );
  }
}
