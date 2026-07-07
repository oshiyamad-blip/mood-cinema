import 'package:flutter/material.dart';

import 'ads/ads.dart';
import 'billing/features.dart';
import 'billing/purchase_service.dart';
import 'data/script_repository.dart';
import 'data/settings_store.dart';
import 'screens/home_screen.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 保存済みの台本・設定を端末ローカルから読み込む。
  await ScriptRepository.instance.init();
  await SettingsStore.instance.init();
  if (Features.freeWithAds) {
    // 完全無料＋広告モード：広告SDKだけ初期化（awaitせず起動をブロックしない）。
    AdsService.init();
  } else {
    // 課金（未設定なら無料層で動作）。
    await PurchaseService.instance.init();
  }
  runApp(const SerifuApp());
}

class SerifuApp extends StatelessWidget {
  const SerifuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ホンヨミ',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: const HomeScreen(),
    );
  }
}
