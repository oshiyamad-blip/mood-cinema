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
  /// フォントに ToUnicode が無いPDFの化けは、ギリシャ文字・結合記号・
  /// グジャラート文字・タミル文字…のように**無関係な文字体系が入り乱れる**。
  /// 一方、正しい台本はどの言語でも1〜2種類の文字体系（日本語なら
  /// かな・漢字、韓国語ならハングル＋漢字、ロシア語ならキリル）に集中する。
  /// そこで次のいずれかなら化けとみなす：
  /// - 上位2つの文字体系で文字の6割に満たない（体系が散らばっている）
  /// - 結合用の記号（U+0300台）が文字の8%を超える
  /// - 私用領域（PUA）の文字が文字の2割を超える
  /// 記号・数字・英字・空白は判定に使わない。短すぎる文は判定しない。
  static bool looksGarbled(String text) {
    final counts = <String, int>{};
    var letters = 0, combining = 0, privateUse = 0;
    for (final r in text.runes) {
      if (_isNeutralChar(r)) continue;
      letters++;
      if (r >= 0x0300 && r <= 0x036F) combining++;
      if (r >= 0xE000 && r <= 0xF8FF) privateUse++;
      final bucket = _scriptBucket(r);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    if (letters < 16) return false;
    if (combining > letters * 0.08) return true;
    if (privateUse > letters * 0.2) return true;
    final sorted = counts.values.toList()..sort((a, b) => b.compareTo(a));
    final top2 = sorted.take(2).fold<int>(0, (a, b) => a + b);
    return top2 < letters * 0.6;
  }

  /// 文字体系の判定に使わない文字（空白・ASCII・約物・記号類）。
  static bool _isNeutralChar(int r) {
    return r <= 0xBF || // ASCII・Latin-1 の記号
        (r >= 0x2000 && r <= 0x2BFF) || // 一般句読点・矢印・図形・★♪等
        (r >= 0x3000 && r <= 0x303F) || // 和文約物（、。「」〜）
        (r >= 0xFE00 && r <= 0xFE6F) || // 異体字セレクタ・縦書き用約物
        (r >= 0xFF00 && r <= 0xFF65) || // 全角英数・全角記号
        (r >= 0x1F000 && r <= 0x1FAFF); // 絵文字
  }

  /// 文字の属する文字体系（おおまかな分類）。
  static String _scriptBucket(int r) {
    if ((r >= 0x3040 && r <= 0x30FF) || // かな
        (r >= 0x31F0 && r <= 0x31FF) ||
        (r >= 0xFF66 && r <= 0xFF9F) || // 半角カナ
        (r >= 0x3400 && r <= 0x4DBF) || // 漢字
        (r >= 0x4E00 && r <= 0x9FFF) ||
        (r >= 0xF900 && r <= 0xFAFF) ||
        r >= 0x20000) {
      return 'cjk';
    }
    if ((r >= 0x1100 && r <= 0x11FF) ||
        (r >= 0x3130 && r <= 0x318F) ||
        (r >= 0xAC00 && r <= 0xD7AF)) {
      return 'hangul';
    }
    if ((r >= 0x00C0 && r <= 0x024F) || (r >= 0x1E00 && r <= 0x1EFF)) {
      return 'latin';
    }
    if (r >= 0x0300 && r <= 0x036F) return 'combining';
    if (r >= 0x0370 && r <= 0x03FF) return 'greek';
    if (r >= 0x0400 && r <= 0x052F) return 'cyrillic';
    if (r >= 0xE000 && r <= 0xF8FF) return 'private';
    return 'block${r >> 7}'; // その他は128字ごとの区画で数える
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
