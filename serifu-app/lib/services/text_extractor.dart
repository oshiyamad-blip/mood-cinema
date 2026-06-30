import 'dart:io';

import 'package:syncfusion_flutter_pdf/pdf.dart';

/// ファイルから生テキストを抽出する（端末内処理）。
///
/// MVP対応：
///   - PDF（テキスト埋込）… syncfusion で抽出
/// 将来対応（TODO）：
///   - .docx … XML(zip)を解析、またはサーバ無しの軽量パーサ
///   - 画像PDF/写真 … OCR（ML Kit / Apple Vision）
class TextExtractor {
  Future<String> extract(File file) async {
    final ext = file.path.toLowerCase().split('.').last;
    switch (ext) {
      case 'pdf':
        return _extractPdf(file);
      case 'txt':
        return file.readAsString();
      case 'docx':
        throw UnsupportedError('docx は将来対応予定です。現状は PDF / TXT に対応しています。');
      default:
        throw UnsupportedError('未対応の形式です: .$ext');
    }
  }

  Future<String> _extractPdf(File file) async {
    final bytes = await file.readAsBytes();
    final document = PdfDocument(inputBytes: bytes);
    try {
      return PdfTextExtractor(document).extractText();
    } finally {
      document.dispose();
    }
  }
}
