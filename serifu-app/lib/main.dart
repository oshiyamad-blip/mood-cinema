import 'package:flutter/material.dart';

import 'screens/home_screen.dart';

void main() {
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
