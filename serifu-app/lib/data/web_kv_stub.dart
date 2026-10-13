/// モバイル/テスト用スタブ：Web以外ではブラウザストレージは使わない。
class WebKv {
  WebKv._();
  static String? read(String key) => null;

  /// 保存できたら true。
  static bool write(String key, String value) => true;
}
