import 'package:web/web.dart' as web;

/// Web実装：localStorage を使う（容量超過・プライベートモードでは静かに諦める）。
class WebKv {
  WebKv._();

  static String? read(String key) {
    try {
      return web.window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  static void write(String key, String value) {
    try {
      web.window.localStorage.setItem(key, value);
    } catch (_) {
      // 容量不足等 → 保存なしで続行（メモリのみ）。
    }
  }
}
