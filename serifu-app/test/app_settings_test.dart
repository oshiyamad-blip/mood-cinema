import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/app_settings.dart';
import 'package:serifu_app/models/script.dart';

void main() {
  test('AppSettings の JSON ラウンドトリップで内容が保持される', () {
    final original = AppSettings(
      defaultGender: Gender.male,
      defaultRate: 1.3,
      defaultReadDirections: false,
      autoAdvanceSeconds: 5,
      useCloudVoices: true,
    );

    final restored =
        AppSettings.fromJson(Map<String, dynamic>.from(jsonDecode(jsonEncode(original.toJson())) as Map));

    expect(restored.defaultGender, Gender.male);
    expect(restored.defaultRate, 1.3);
    expect(restored.defaultReadDirections, false);
    expect(restored.autoAdvanceSeconds, 5);
    expect(restored.useCloudVoices, true);
  });

  test('欠損キーは既定値にフォールバックする', () {
    final restored = AppSettings.fromJson(const {});
    expect(restored.defaultGender, Gender.female);
    expect(restored.defaultRate, 1.0);
    expect(restored.defaultReadDirections, true);
    expect(restored.autoAdvanceSeconds, 0);
    expect(restored.useCloudVoices, false);
  });
}
