import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../models/app_settings.dart';
import 'web_kv.dart';

/// アプリ設定の保管庫。端末ローカル（JSON）に永続化する。
/// Web版（お試し版）はブラウザの localStorage に保存する。
class SettingsStore extends ChangeNotifier {
  SettingsStore._();
  static final SettingsStore instance = SettingsStore._();

  static const _webKey = 'honyomi:settings.json';

  AppSettings _settings = AppSettings();
  bool _loaded = false;

  AppSettings get settings => _settings;

  Future<File> _file() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/settings.json');
  }

  Future<void> init() async {
    if (_loaded) return;
    try {
      final String raw;
      if (kIsWeb) {
        raw = WebKv.read(_webKey) ?? '';
      } else {
        final file = await _file();
        raw = await file.exists() ? await file.readAsString() : '';
      }
      if (raw.trim().isNotEmpty) {
        _settings = AppSettings.fromJson(
          Map<String, dynamic>.from(jsonDecode(raw) as Map),
        );
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
    if (kIsWeb) {
      WebKv.write(_webKey, jsonEncode(_settings.toJson()));
      return;
    }
    _file().then((f) => f.writeAsString(jsonEncode(_settings.toJson()))).catchError((_) {
      return File('');
    });
  }
}
