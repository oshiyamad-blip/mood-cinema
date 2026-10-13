/// ファイルを端末に保存（ダウンロード）する。Web版の台本書き出しに使う。
/// モバイルでは共有シートを使うため、このスタブは使われない。
library;

export 'file_download_stub.dart' if (dart.library.js_interop) 'file_download_web.dart';
