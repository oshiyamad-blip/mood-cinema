import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/services/docx_text_extractor.dart';

/// 最小限の .docx（word/document.xml だけを持つzip）を組み立てる。
List<int> buildDocx(String documentXml) {
  final archive = Archive();
  final bytes = utf8.encode(documentXml);
  archive.addFile(ArchiveFile('word/document.xml', bytes.length, bytes));
  return ZipEncoder().encode(archive)!;
}

void main() {
  final extractor = DocxTextExtractor();

  test('段落と複数テキストランを連結して抽出する', () {
    const xml = '''
<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>太郎「おはよう」</w:t></w:r></w:p>
<w:p><w:r><w:t>花子「おはよう、</w:t></w:r><w:r><w:t>太郎くん」</w:t></w:r></w:p>
</w:body>
</w:document>''';
    final text = extractor.extractFromBytes(buildDocx(xml));
    expect(text, contains('太郎「おはよう」'));
    // 同一段落内のランは連結される。
    expect(text, contains('花子「おはよう、太郎くん」'));
  });

  test('docxでない場合は FormatException', () {
    final notDocx = buildDocxWithoutDocument();
    expect(() => extractor.extractFromBytes(notDocx), throwsA(isA<FormatException>()));
  });
}

List<int> buildDocxWithoutDocument() {
  final archive = Archive();
  final bytes = utf8.encode('hello');
  archive.addFile(ArchiveFile('other.txt', bytes.length, bytes));
  return ZipEncoder().encode(archive)!;
}
