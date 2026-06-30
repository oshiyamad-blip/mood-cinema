import 'package:flutter/material.dart';

import 'data/script_repository.dart';
import 'screens/home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 保存済みの台本を端末ローカルから読み込む。
  await ScriptRepository.instance.init();
  runApp(const SerifuApp());
}

class SerifuApp extends StatelessWidget {
  const SerifuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'セリフ稽古',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF6C5CE7),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
