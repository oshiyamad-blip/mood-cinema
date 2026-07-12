import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/data/sample_script.dart';
import 'package:serifu_app/data/script_repository.dart';
import 'package:serifu_app/screens/home_screen.dart';
import 'package:serifu_app/theme/app_theme.dart';

void main() {
  testWidgets('台本ありホームに「練習をつづける／取り込む」の2択が出る', (tester) async {
    ScriptRepository.instance.add(buildSampleScript());
    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light(), home: const HomeScreen()),
    );
    await tester.pump();
    expect(find.text('練習をつづける'), findsOneWidget);
    expect(find.text('台本を取り込む'), findsWidgets);
    expect(find.textContaining('件の台本'), findsOneWidget);
  });
}
