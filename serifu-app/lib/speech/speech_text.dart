/// セリフ本文から「声に出さない部分」を除いたテキストを返す。
///
/// 台本の慣習として、セリフ中の（）は演技指示（「（笑いながら）」「（間）」等）で、
/// 役者は声に出さない。読み上げ（TTS・事前合成・クラウド合成）と
/// ハンズフリーの音声照合の両方で（）内を無視する。画面表示は原文のまま。
String speechText(String text) {
  var t = text;
  final paren = RegExp(r'[（(][^（()）]*[）)]');
  // 入れ子（（外（内）外）等）にも対応できるよう、内側から順に剥がす。
  for (var i = 0; i < 4 && paren.hasMatch(t); i++) {
    t = t.replaceAll(paren, '');
  }
  return t.replaceAll(RegExp(r'[ 　]{2,}'), ' ').trim();
}
