/// モバイル/テスト用スタブ：Web以外ではブラウザストレージは使わない。
class WebKv {
  WebKv._();
  static String? read(String key) => null;
  static void write(String key, String value) {}
}
