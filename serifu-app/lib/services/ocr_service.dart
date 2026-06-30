import 'dart:io';
import 'dart:typed_data';

import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart';

/// オンデバイスOCR（ML Kit, 日本語）。台本データは端末外へ送信しない。
///
/// - 写真/画像ファイル（jpg/png等）から直接テキスト認識
/// - 画像PDF（テキスト埋込なし）は各ページをラスタライズしてから認識
class OcrService {
  /// 画像ファイルから日本語テキストを認識する。
  Future<String> recognizeImageFile(File image) async {
    final recognizer = TextRecognizer(script: TextRecognitionScript.japanese);
    try {
      final result = await recognizer.processImage(InputImage.fromFile(image));
      return result.text;
    } finally {
      await recognizer.close();
    }
  }

  /// 画像PDFを1ページずつラスタライズしてOCRする。
  Future<String> recognizePdf(File pdf) async {
    final doc = await PdfDocument.openFile(pdf.path);
    final recognizer = TextRecognizer(script: TextRecognitionScript.japanese);
    final out = StringBuffer();
    try {
      for (var i = 1; i <= doc.pagesCount; i++) {
        final page = await doc.getPage(i);
        try {
          // 解像度を上げて認識精度を確保（等倍だと小さい文字が潰れる）。
          final rendered = await page.render(
            width: page.width * 2,
            height: page.height * 2,
            format: PdfPageImageFormat.png,
          );
          if (rendered == null) continue;
          final tmp = await _writeTemp(rendered.bytes, 'ocr_page_$i.png');
          final result = await recognizer.processImage(InputImage.fromFile(tmp));
          out.writeln(result.text);
        } finally {
          await page.close();
        }
      }
    } finally {
      await recognizer.close();
      await doc.close();
    }
    return out.toString();
  }

  Future<File> _writeTemp(Uint8List bytes, String name) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$name');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }
}
