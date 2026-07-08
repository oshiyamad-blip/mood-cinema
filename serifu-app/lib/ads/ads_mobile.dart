import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_route_observer.dart';

/// AdMob の初期化（モバイルのみ）。失敗してもアプリは通常どおり動く。
class AdsService {
  AdsService._();

  static Future<void> init() async {
    try {
      // 審査・ポリシー対応：
      // - 広告コンテンツは全年齢向け（G）に制限
      // - 子ども向けアプリではない（対象年齢は一般）
      await MobileAds.instance.updateRequestConfiguration(
        RequestConfiguration(
          maxAdContentRating: MaxAdContentRating.g,
          tagForChildDirectedTreatment: TagForChildDirectedTreatment.no,
          tagForUnderAgeOfConsent: TagForUnderAgeOfConsent.no,
        ),
      );
      await MobileAds.instance.initialize();
    } catch (_) {
      // SDK初期化に失敗 → 広告なしで続行。
    }
  }
}

/// ホーム画面下部の小さなバナー広告。
///
/// ポリシー対応の設計：
/// - **ホームが最前面のときだけ**ロード・表示する。他の画面（練習画面を含む）
///   へ遷移した瞬間に破棄し、裏で更新され続けることを構造的に防ぐ
///   （練習中に広告が出ない保証も兼ねる。test/ads_guard_test.dart で検証）
/// - 非パーソナライズ広告のみ要求（iOSのATTダイアログ不要・GDPR/日本の
///   プライバシー方針と整合）
/// - 読み込み完了まで／失敗時は高さ0（コンテンツを押しのけない・偽装しない）
/// - FABとの誤タップ防止に上マージンを確保
class AdBanner extends StatefulWidget {
  const AdBanner({super.key});

  @override
  State<AdBanner> createState() => _AdBannerState();
}

class _AdBannerState extends State<AdBanner> with RouteAware {
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
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != null) adRouteObserver.subscribe(this, route);
    if (_ad == null) _load();
  }

  // 他の画面がこの画面の上にプッシュされた（練習開始など）→ 広告を破棄。
  @override
  void didPushNext() => _disposeAd();

  // 上の画面が閉じてホームに戻ってきた → 改めてロード。
  @override
  void didPopNext() => _load();

  Future<void> _load() async {
    if (_ad != null) return;
    try {
      final ad = BannerAd(
        adUnitId: Platform.isIOS ? _iosUnitId : _androidUnitId,
        size: AdSize.banner,
        request: const AdRequest(nonPersonalizedAds: true),
        listener: BannerAdListener(
          onAdLoaded: (_) {
            if (mounted) setState(() => _loaded = true);
          },
          onAdFailedToLoad: (ad, error) {
            ad.dispose();
            if (mounted) {
              setState(() {
                _ad = null;
                _loaded = false;
              });
            }
          },
        ),
      );
      _ad = ad;
      await ad.load();
    } catch (_) {
      // テスト環境や未対応端末では広告なしで続行。
      _ad = null;
    }
  }

  void _disposeAd() {
    _ad?.dispose();
    _ad = null;
    if (mounted) setState(() => _loaded = false);
  }

  @override
  void dispose() {
    adRouteObserver.unsubscribe(this);
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ad = _ad;
    if (!_loaded || ad == null) return const SizedBox.shrink();
    return SafeArea(
      top: false,
      child: Padding(
        // FAB・リスト項目との誤タップ防止のための余白。
        padding: const EdgeInsets.only(top: 8),
        child: SizedBox(
          width: double.infinity,
          height: ad.size.height.toDouble(),
          child: Center(
            child: SizedBox(
              width: ad.size.width.toDouble(),
              height: ad.size.height.toDouble(),
              child: AdWidget(ad: ad),
            ),
          ),
        ),
      ),
    );
  }
}
