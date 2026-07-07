import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

/// AdMob の初期化（モバイルのみ）。失敗してもアプリは通常どおり動く。
class AdsService {
  AdsService._();

  static Future<void> init() async {
    try {
      await MobileAds.instance.initialize();
    } catch (_) {
      // SDK初期化に失敗 → 広告なしで続行。
    }
  }
}

/// ホーム画面下部の小さなバナー広告。
///
/// - 読み込み完了までは高さ0（レイアウトを崩さない）
/// - 読み込み失敗時も高さ0のまま（縮退動作）
/// - ユニットIDは dart-define で差し替え可能。既定はGoogleの公式テストID
///   （本番リリース時に AdMob 管理画面で発行した本物のIDを指定する）。
class AdBanner extends StatefulWidget {
  const AdBanner({super.key});

  @override
  State<AdBanner> createState() => _AdBannerState();
}

class _AdBannerState extends State<AdBanner> {
  static const _androidUnitId = String.fromEnvironment(
    'ADMOB_BANNER_ANDROID',
    // Google公式のテスト用バナーID（Android）
    defaultValue: 'ca-app-pub-3940256099942544/6300978111',
  );
  static const _iosUnitId = String.fromEnvironment(
    'ADMOB_BANNER_IOS',
    // Google公式のテスト用バナーID（iOS）
    defaultValue: 'ca-app-pub-3940256099942544/2934735716',
  );

  BannerAd? _ad;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final ad = BannerAd(
        adUnitId: Platform.isIOS ? _iosUnitId : _androidUnitId,
        size: AdSize.banner,
        request: const AdRequest(),
        listener: BannerAdListener(
          onAdLoaded: (_) {
            if (mounted) setState(() => _loaded = true);
          },
          onAdFailedToLoad: (ad, error) {
            ad.dispose();
            if (mounted) setState(() => _loaded = false);
          },
        ),
      );
      _ad = ad;
      await ad.load();
    } catch (_) {
      // テスト環境や未対応端末では広告なしで続行。
    }
  }

  @override
  void dispose() {
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ad = _ad;
    if (!_loaded || ad == null) return const SizedBox.shrink();
    return SafeArea(
      top: false,
      child: SizedBox(
        width: ad.size.width.toDouble(),
        height: ad.size.height.toDouble(),
        child: AdWidget(ad: ad),
      ),
    );
  }
}
