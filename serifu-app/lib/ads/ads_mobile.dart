import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_route_observer.dart';

/// AdMob の初期化と、全世界配信で必須の同意管理（UMP）。
///
/// 全世界に配信するため、EEA/英国のユーザーには Google 認定の同意管理
/// （UMP: User Messaging Platform）で同意を取得してからでないと広告を
/// 要求できない。日本など同意フォームが不要な地域では実質何もしない。
/// いずれにせよ本アプリは**非パーソナライズ広告のみ**要求する
/// （プライバシー方針と整合。同意しても個別化はしない）。
class AdsService {
  AdsService._();

  /// 広告を要求してよい状態になったか。バナーはこれが true になってから
  /// ロードする（同意取得前に広告を出さない）。起動時は false。
  static final ValueNotifier<bool> adsReady = ValueNotifier<bool>(false);

  static Future<void> init() async {
    try {
      // まず同意情報を更新し、必要なら同意フォームを表示する（EEA等）。
      await _gatherConsent();
      // 同意取得の結果、広告を要求できないなら広告なしで続行。
      if (!await ConsentInformation.instance.canRequestAds()) return;

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
      adsReady.value = true;
    } catch (_) {
      // SDK初期化や同意取得に失敗 → 広告なしで続行（アプリは通常動作）。
    }
  }

  /// UMP の同意フロー。同意情報を更新し、必要なら同意フォームを表示する。
  /// フォームが返らない環境で起動をブロックしないようタイムアウトを設ける。
  static Future<void> _gatherConsent() async {
    final completer = Completer<void>();
    void done() {
      if (!completer.isCompleted) completer.complete();
    }

    try {
      final params =
          ConsentRequestParameters(tagForUnderAgeOfConsent: false);
      ConsentInformation.instance.requestConsentInfoUpdate(
        params,
        () async {
          // 更新成功 → 必要なら同意フォームを表示（不要地域は即完了）。
          try {
            await ConsentForm.loadAndShowConsentFormIfRequired((_) => done());
          } catch (_) {
            done();
          }
        },
        (_) => done(), // 更新失敗 → 広告なしで続行（canRequestAdsで判定）。
      );
    } catch (_) {
      done();
    }

    return completer.future
        .timeout(const Duration(seconds: 8), onTimeout: () {});
  }

  /// 「広告の同意設定」を表示すべき地域か（UMPが要求する場合のみ true）。
  /// 設定画面でこのボタンを出すかの判定に使う。
  static Future<bool> privacyOptionsRequired() async {
    try {
      final status = await ConsentInformation.instance
          .getPrivacyOptionsRequirementStatus();
      return status == PrivacyOptionsRequirementStatus.required;
    } catch (_) {
      return false;
    }
  }

  /// 同意の選択をやり直すフォームを表示する（設定画面から呼ぶ）。
  static Future<void> showPrivacyOptions() async {
    try {
      await ConsentForm.showPrivacyOptionsForm((_) {});
    } catch (_) {
      // 表示に失敗しても致命的ではない。
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
  void initState() {
    super.initState();
    // 同意取得が起動直後に間に合わないことがあるため、広告可能になったら
    // （adsReadyがtrueに変わったら）改めてロードする。
    AdsService.adsReady.addListener(_onAdsReadyChanged);
  }

  void _onAdsReadyChanged() {
    if (AdsService.adsReady.value && _ad == null && mounted) _load();
  }

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
    // 同意取得が済んでいなければ広告を要求しない（済み次第 _onAdsReadyChanged で再試行）。
    if (!AdsService.adsReady.value) return;
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
    AdsService.adsReady.removeListener(_onAdsReadyChanged);
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
