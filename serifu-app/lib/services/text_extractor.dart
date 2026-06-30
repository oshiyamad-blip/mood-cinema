import 'dart:io';

import 'package:syncfusion_flutter_pdf/pdf.dart';

import 'docx_text_extractor.dart';
import 'ocr_service.dart';

/// ファイルから生テキストを抽出する（すべて端末内処理）。
///
/// 対応形式：
///   - PDF（テキスト埋込）… syncfusion で抽出。テキストが無ければOCRへフォールバック
///   - PDF（画像）        … 各ページをラスタライズしてOCR（ML Kit, 日本語）
///   - .docx              … zip+XMLを純Dartで解析
///   - 画像（jpg/png等）  … OCR（写真で撮った台本）
///   - .txt               … そのまま
class TextExtractor {
  TextExtractor({OcrService? ocr, DocxTextExtractor? docx})
      : _ocr = ocr ?? OcrService(),
        _docx = docx ?? DocxTextExtractor();

  final OcrService _ocr;
  final DocxTextExtractor _docx;

  static const imageExtensions = {'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'bmp'};
  static const supportedExtensions = {'pdf', 'docx', 'txt', ...imageExtensions};

  Future<String> extract(File file) async {
    final ext = file.path.toLowerCase().split('.').last;
    if (ext == 'pdf') return _extractPdf(file);
    if (ext == 'docx') return _docx.extract(file);
    if (ext == 'txt') return file.readAsString();
    if (imageExtensions.contains(ext)) return _ocr.recognizeImageFile(file);
    throw UnsupportedError('未対応の形式です: .$ext');
  }

  Future<String> _extractPdf(File file) async {
    final bytes = await file.readAsBytes();
    final document = PdfDocument(inputBytes: bytes);
    String text;
    try {
      text = PdfTextExtractor(document).extractText();
    } finally {
      document.dispose();
    }
    // テキストが取れなければ画像PDFとみなしてOCRへ。
    if (text.trim().isNotEmpty) return text;
    return _ocr.recognizePdf(file);
  }
}
