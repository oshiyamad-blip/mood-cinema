import 'package:flutter/widgets.dart';

/// Web用スタブ：広告は表示しない。
class AdsService {
  AdsService._();

  /// モバイル版とAPIを揃えるためのダミー（Webでは常に false のまま）。
  static final ValueNotifier<bool> adsReady = ValueNotifier<bool>(false);

  static Future<void> init() async {}

  /// Webでは同意フォームの入口を出さない。
  static Future<bool> privacyOptionsRequired() async => false;

  static Future<void> showPrivacyOptions() async {}
}

/// Web用スタブ：何も描画しない。
class AdBanner extends StatelessWidget {
  const AdBanner({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
