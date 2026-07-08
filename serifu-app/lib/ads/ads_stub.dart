import 'package:flutter/widgets.dart';

/// Web用スタブ：広告は表示しない。
class AdsService {
  AdsService._();
  static Future<void> init() async {}
}

/// Web用スタブ：何も描画しない。
class AdBanner extends StatelessWidget {
  const AdBanner({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
