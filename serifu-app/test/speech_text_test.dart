import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/speech/speech_text.dart';

void main() {
  group('speechText（セリフ中の（）は声に出さない）', () {
    test('全角（）を除く', () {
      expect(speechText('（笑いながら）おはよう'), 'おはよう');
      expect(speechText('おはよう（間）…行こうか'), 'おはよう…行こうか');
    });

    test('半角()・複数個・入れ子も除く', () {
      expect(speechText('(小声で)ねえ（振り向いて）聞いてる？'), 'ねえ聞いてる？');
      expect(speechText('外（内（さらに内）内）外'), '外外');
    });

    test('（）だけのセリフは空になる', () {
      expect(speechText('（うなずく）'), '');
    });

    test('（）が無ければそのまま（前後の空白だけ整える）', () {
      expect(speechText(' そうだね '), 'そうだね');
    });

    test('除いた跡の連続空白は詰める', () {
      expect(speechText('うん （考えて） そうする'), 'うん そうする');
    });
  });
}
