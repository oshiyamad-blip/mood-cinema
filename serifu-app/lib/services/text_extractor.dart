import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show Uint8List;
import 'package:syncfusion_flutter_pdf/pdf.dart';

import 'docx_text_extractor.dart';
import 'ocr_service.dart';
import 'pdf_layout_text.dart';

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
      if (text.trim().isNotEmpty && !looksGarbled(text)) return text;
      // 空（画像PDF）または文字化け（特殊フォント）→ OCRが必要だがWebは非対応。
      throw UnsupportedError(
          'このPDFは文字情報が読み取れない（画像PDF、または特殊なフォント）ため、'
          'Web版では取り込めません。モバイル版（写真OCR対応）をお試しください。');
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
    // テキストが取れない（画像PDF）か、取れても文字化けしている
    // （フォントにToUnicodeが無い等で埋込テキストが壊れている）場合は、
    // ページを画像化してOCRする（見た目の文字は正しいため復元できる）。
    if (text.trim().isNotEmpty && !looksGarbled(text)) return text;
    return _ocr.recognizePdf(file);
  }

  /// 抽出テキストが文字化けしているかの推定（純関数・テスト可能）。
  ///
  /// 日本語（または英数）の台本を想定し、「妥当な文字」＝かな・漢字・ASCII・
  /// 全角英数/半角カナ・和文約物 の割合が半分未満なら文字化けとみなす。
  /// ToUnicode欠落のPDFはギリシャ文字・IPA・結合ダイアクリティカル等に化けるため、
  /// この割合が極端に低くなる。短すぎるテキストは誤爆回避のため判定しない。
  static bool looksGarbled(String text) {
    var expected = 0;
    var total = 0;
    for (final r in text.runes) {
      // 空白類はカウントしない。
      if (r == 0x20 || r == 0x09 || r == 0x0A || r == 0x0D || r == 0x3000) {
        continue;
      }
      total++;
      if (_isPlausibleScriptChar(r)) expected++;
    }
    if (total < 16) return false; // 短文は判定しない
    return expected / total < 0.5;
  }

  static bool _isPlausibleScriptChar(int r) {
    return (r >= 0x3040 && r <= 0x30FF) || // ひらがな・カタカナ
        (r >= 0x4E00 && r <= 0x9FFF) || // CJK統合漢字
        (r >= 0x3400 && r <= 0x4DBF) || // CJK拡張A
        (r >= 0xFF00 && r <= 0xFFEF) || // 全角英数・半角カナ
        (r >= 0x20 && r <= 0x7E) || // ASCII
        (r >= 0x3000 && r <= 0x303F) || // 和文約物（、。「」（）等）
        r == 0x2026 || // …
        r == 0x2015 || r == 0x2014 || r == 0x2212 || // ―—−
        r == 0x25CB || r == 0x25EF || r == 0x3007; // ○◯〇
  }

  /// テキスト埋込PDFからの抽出（純Dart・全プラットフォーム共通）。
  ///
  /// 縦書き台本のPDFは素朴な抽出だと1文字ずつバラバラになるため、
  /// レイアウト（座標）情報から視覚上の行を復元する。
  /// レイアウト抽出に失敗した場合のみ素朴な抽出へフォールバック。
  String _extractPdfText(Uint8List bytes) {
    final document = PdfDocument(inputBytes: bytes);
    try {
      final extractor = PdfTextExtractor(document);
      try {
        final pages = <List<GlyphRun>>[];
        for (var p = 0; p < document.pages.count; p++) {
          final textLines =
              extractor.extractTextLines(startPageIndex: p, endPageIndex: p);
          pages.add([
            for (final l in textLines)
              GlyphRun(
                x: l.bounds.left,
                y: l.bounds.top,
                width: l.bounds.width,
                height: l.bounds.height,
                text: l.text,
              ),
          ]);
        }
        final text = PdfLayoutText.reconstruct(pages);
        if (text.trim().isNotEmpty) return text;
      } catch (_) {
        // レイアウト抽出に失敗 → 素朴な抽出へ。
      }
      return PdfTextExtractor(document).extractText();
    } finally {
      document.dispose();
    }
  }
}
