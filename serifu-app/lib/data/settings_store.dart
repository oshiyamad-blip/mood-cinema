import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../models/app_settings.dart';

/// アプリ設定の保管庫。端末ローカル（JSON）に永続化する。
/// Web版（PC確認用）は永続化せず、メモリのみで動作する。
class SettingsStore extends ChangeNotifier {
  SettingsStore._();
  static final SettingsStore instance = SettingsStore._();

  AppSettings _settings = AppSettings();
  bool _loaded = false;

  AppSettings get settings => _settings;

  Future<File> _file() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/settings.json');
  }

  Future<void> init() async {
    if (_loaded) return;
    if (kIsWeb) {
      // Webは永続化なし：既定値のまま開始する。
      _loaded = true;
      notifyListeners();
      return;
    }
    try {
      final file = await _file();
      if (await file.exists()) {
        final raw = await file.readAsString();
        if (raw.trim().isNotEmpty) {
          _settings = AppSettings.fromJson(
            Map<String, dynamic>.from(jsonDecode(raw) as Map),
          );
        }
      }
    } catch (_) {
      _settings = AppSettings();
    }
    _loaded = true;
    notifyListeners();
  }

  void update(AppSettings next) {
    _settings = next;
    notifyListeners();
    _persist();
  }

  void _persist() {
    if (kIsWeb) return; // Webは保存をスキップ（メモリのみ）
    _file().then((f) => f.writeAsString(jsonEncode(_settings.toJson()))).catchError((_) {
      return File('');
    });
  }
}
