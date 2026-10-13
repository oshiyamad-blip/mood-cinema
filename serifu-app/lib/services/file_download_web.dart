import 'dart:convert';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

/// Web実装：Blob を作ってダウンロードさせる（データはブラウザ内で完結し、
/// サーバへは送らない）。
class FileDownload {
  FileDownload._();

  static bool save(String fileName, String content) {
    try {
      final bytes = utf8.encode(content);
      final blob = web.Blob(
        <JSAny>[bytes.toJS].toJS,
        web.BlobPropertyBag(type: 'application/json'),
      );
      final url = web.URL.createObjectURL(blob);
      final a = web.HTMLAnchorElement()
        ..href = url
        ..download = fileName;
      web.document.body?.append(a);
      a.click();
      a.remove();
      Future<void>.delayed(
          const Duration(seconds: 5), () => web.URL.revokeObjectURL(url));
      return true;
    } catch (_) {
      return false;
    }
  }
}
