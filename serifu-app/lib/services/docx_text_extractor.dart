import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:xml/xml.dart';

/// .docx からテキストを抽出する（純Dart・端末内処理）。
///
/// .docx は OOXML（zip）。本文は `word/document.xml` に格納され、
/// 段落 `<w:p>` 内の `<w:t>`（テキストラン）を連結すると本文が得られる。
/// `<w:tab/>` `<w:br/>` は空白/改行として扱う。
class DocxTextExtractor {
  Future<String> extract(File file) async {
    final bytes = await file.readAsBytes();
    return extractFromBytes(bytes);
  }

  /// テスト用：バイト列から直接抽出する。
  String extractFromBytes(List<int> bytes) {
    final archive = ZipDecoder().decodeBytes(bytes);
    final docFile = archive.findFile('word/document.xml');
    if (docFile == null) {
      throw const FormatException('word/document.xml が見つかりません（docxではない可能性）。');
    }
    final xmlStr = utf8.decode(docFile.content as List<int>);
    final document = XmlDocument.parse(xmlStr);

    final out = StringBuffer();
    for (final p in document.findAllElements('w:p')) {
      final line = StringBuffer();
      // 段落内を文書順に走査して t / tab / br を反映する。
      for (final node in p.descendants.whereType<XmlElement>()) {
        switch (node.name.qualified) {
          case 'w:t':
            line.write(node.innerText);
          case 'w:tab':
            line.write('\t');
          case 'w:br':
          case 'w:cr':
            line.write('\n');
        }
      }
      out.writeln(line.toString());
    }
    return out.toString();
  }
}
