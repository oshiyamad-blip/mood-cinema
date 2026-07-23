import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/services/text_extractor.dart';

void main() {
  group('looksGarbled（文字化け検出）', () {
    test('正常な日本語台本は化けと判定しない', () {
      const ja = 'ユウ「ごめん遅くなって」\nマコト「お父さんの体調どう？」\n'
          'ユウ「来週の水曜に手術」\nマコト「そう、いける？」';
      expect(TextExtractor.looksGarbled(ja), isFalse);
    });

    test('英語の台本も化けと判定しない', () {
      const en = 'ANNA: I never meant to hurt you.\n'
          'BEN: Then why did you leave without a word?\n'
          'ANNA: Because staying would have hurt more.';
      expect(TextExtractor.looksGarbled(en), isFalse);
    });

    test('ToUnicode欠落PDF由来の文字化け（ギリシャ/IPA/結合）は化けと判定する', () {
      // フォントにToUnicodeが無いPDFで実際に得られる類の文字列。
      const garbled = 'ώϊΩ εɹΪ ͋ồỏΘ͔Μͳ͔ỳͨỐ͜͏͍͏ͱ͜Ͱձ͏ͱ '
          'ઌੜ΋ͳΜ͔ҧ͏͡ײỐനҥணͯͳ͍ͱී௨ͷਓΈ͍ͨ ੜ·Ε΋ҭͪ΋Ố';
      expect(TextExtractor.looksGarbled(garbled), isTrue);
    });

    test('短すぎるテキストは誤爆を避けて化け扱いしない', () {
      expect(TextExtractor.looksGarbled('ώϊΩ'), isFalse);
      expect(TextExtractor.looksGarbled(''), isFalse);
    });

    test('記号・数字混じりの正常テキストは化けと判定しない', () {
      const mixed = '第2場　カフェ（夕）\nA子「1時に来てね、じゃあまた。」';
      expect(TextExtractor.looksGarbled(mixed), isFalse);
    });
  });
}
