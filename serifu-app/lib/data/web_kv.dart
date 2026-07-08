/// Web版のブラウザ内キー値ストレージ。
///
/// 台本・設定を localStorage に保存し、リロードしても消えないようにする
/// （お試し版としての最低限の永続化。データはブラウザ内のみ・サーバ送信なし）。
/// モバイル/テスト（VM）ではスタブが選ばれ、常に null / no-op になる。
library;

export 'web_kv_stub.dart' if (dart.library.js_interop) 'web_kv_web.dart';
