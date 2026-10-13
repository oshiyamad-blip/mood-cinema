import 'package:web/web.dart' as web;

/// Web実装：localStorage を使う。
class WebKv {
  WebKv._();

  static String? read(String key) {
    try {
      return web.window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  /// 保存できたら true。容量超過・プライベートモード・ストレージ無効では false
  /// （呼び出し側が「保存できていない」ことをユーザーに伝えられるように）。
  static bool write(String key, String value) {
    try {
      web.window.localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }
}
