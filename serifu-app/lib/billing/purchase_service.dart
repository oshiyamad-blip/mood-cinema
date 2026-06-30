import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import 'billing_config.dart';

/// 購入の結果。UI のフィードバック出し分けに使う。
enum PurchaseOutcome { success, cancelled, failed, unavailable }

/// 課金（RevenueCat）の管理。
///
/// 方針：APIキー未設定でも例外を投げず、**無料層としてアプリが正常動作**する。
/// 有料アクセス（pro エンタイトルメント）の有無を [isPro] で配布する。
class PurchaseService extends ChangeNotifier {
  PurchaseService._();
  static final PurchaseService instance = PurchaseService._();

  bool _available = false;
  bool _isPro = false;

  /// RevenueCat が構成済み（購入が可能）か。
  bool get billingAvailable => _available;

  /// 有料機能にアクセスできるか。
  bool get isPro => BillingConfig.debugUnlockAll || _isPro;

  Future<void> init() async {
    final key = _platformKey();
    if (key == null || key.isEmpty) {
      _available = false; // 未設定 → 課金無効・無料層で動作
      return;
    }
    try {
      await Purchases.setLogLevel(LogLevel.warn);
      await Purchases.configure(PurchasesConfiguration(key));
      _available = true;
      Purchases.addCustomerInfoUpdateListener(_onInfo);
      await refresh();
    } catch (_) {
      _available = false;
    }
  }

  String? _platformKey() {
    if (Platform.isIOS || Platform.isMacOS) return BillingConfig.iosApiKey;
    if (Platform.isAndroid) return BillingConfig.androidApiKey;
    return null;
  }

  void _onInfo(CustomerInfo info) {
    _setPro(info.entitlements.active.containsKey(BillingConfig.entitlementId));
  }

  Future<void> refresh() async {
    if (!_available) return;
    try {
      _onInfo(await Purchases.getCustomerInfo());
    } catch (_) {
      // ネットワーク失敗等は無視（既知の状態を維持）。
    }
  }

  void _setPro(bool value) {
    if (_isPro == value) return;
    _isPro = value;
    notifyListeners();
  }

  /// 販売中のパッケージ（オファリング）。未構成なら空。
  Future<List<Package>> packages() async {
    if (!_available) return [];
    try {
      final offerings = await Purchases.getOfferings();
      return offerings.current?.availablePackages ?? [];
    } catch (_) {
      return [];
    }
  }

  /// 購入。成否判定は purchasePackage が返す CustomerInfo を直接用いる
  /// （refresh() の getCustomerInfo 失敗による成功取りこぼしを避ける）。
  /// どんな例外でも縮退し、結果を [PurchaseOutcome] で返す。
  Future<PurchaseOutcome> buy(Package package) async {
    if (!_available) return PurchaseOutcome.unavailable;
    try {
      final info = await Purchases.purchasePackage(package);
      _onInfo(info); // 戻り値から直接 _isPro を更新
      final unlocked = info.entitlements.active.containsKey(BillingConfig.entitlementId);
      return unlocked ? PurchaseOutcome.success : PurchaseOutcome.failed;
    } on PlatformException catch (e) {
      final code = PurchasesErrorHelper.getErrorCode(e);
      if (code == PurchasesErrorCode.purchaseCancelledError) {
        return PurchaseOutcome.cancelled;
      }
      return PurchaseOutcome.failed;
    } catch (_) {
      return PurchaseOutcome.failed;
    }
  }

  /// 購入の復元。
  Future<bool> restore() async {
    if (!_available) return false;
    try {
      _onInfo(await Purchases.restorePurchases());
      return isPro;
    } catch (_) {
      return false;
    }
  }
}
