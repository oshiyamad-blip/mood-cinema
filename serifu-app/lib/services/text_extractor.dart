import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show Uint8List;
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

  /// Web用：バイト列から抽出する（Webの file_picker はパスではなく bytes を返す）。
  ///
  /// OCRが必要な形式（画像・画像PDF）は ML Kit がWeb未対応のため、
  /// [UnsupportedError] で「Web版では未対応」と明示する（モバイル版では対応）。
  Future<String> extractFromBytes(Uint8List bytes, String fileName) async {
    final ext = fileName.toLowerCase().split('.').last;
    if (ext == 'pdf') {
      final text = _extractPdfText(bytes);
      if (text.trim().isNotEmpty) return text;
      throw UnsupportedError(
          '画像PDFのOCRはWeb版では未対応です。テキスト埋込PDF / docx / TXT をお試しください。');
    }
    if (ext == 'docx') return _docx.extractFromBytes(bytes);
    if (ext == 'txt') return utf8.decode(bytes, allowMalformed: true);
    if (imageExtensions.contains(ext)) {
      throw UnsupportedError('画像・写真のOCRはWeb版では未対応です（モバイル版をご利用ください）。');
    }
    throw UnsupportedError('未対応の形式です: .$ext');
  }

  Future<String> _extractPdf(File file) async {
    final bytes = await file.readAsBytes();
    final text = _extractPdfText(bytes);
    // テキストが取れなければ画像PDFとみなしてOCRへ。
    if (text.trim().isNotEmpty) return text;
    return _ocr.recognizePdf(file);
  }

  /// テキスト埋込PDFからの抽出（純Dart・全プラットフォーム共通）。
  String _extractPdfText(Uint8List bytes) {
    final document = PdfDocument(inputBytes: bytes);
    try {
      return PdfTextExtractor(document).extractText();
    } finally {
      document.dispose();
    }
  }
}
