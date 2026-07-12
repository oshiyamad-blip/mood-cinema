import '../models/script.dart';

/// お試し用のサンプル台本（短い二人芝居）。
///
/// 初回起動で台本ファイルを持っていない人（やストア審査員）が、
/// 取り込みなしで「役を選ぶ→相手の声が返ってくる」体験まで
/// 1タップで到達できるようにする。
const sampleScriptTitle = 'カフェの再会（サンプル）';

Script buildSampleScript() {
  Line d(String id, String speaker, String text) =>
      Line(id: id, type: LineType.dialogue, speaker: speaker, text: text);
  return Script(
    id: 'sample-${DateTime.now().millisecondsSinceEpoch}',
    title: sampleScriptTitle,
    characters: ['ミナ', 'ソウタ'],
    lines: [
      Line(
        id: 'l1',
        type: LineType.direction,
        text: '昼下がりのカフェ。ソウタが先に席についている。',
      ),
      d('l2', 'ミナ', '（駆け込んできて）ごめん、待った？'),
      d('l3', 'ソウタ', 'いや、今来たとこ。……三年ぶり、だよね。'),
      d('l4', 'ミナ', 'そうだっけ。もっと短く感じるな。'),
      d('l5', 'ソウタ', '変わらないね、ミナは。'),
      d('l6', 'ミナ', '（笑って）それ、褒めてる？'),
      d('l7', 'ソウタ', '褒めてるよ。……で、話って何？'),
      d('l8', 'ミナ', '私、来月から大阪なんだ。'),
      d('l9', 'ソウタ', 'えっ。'),
      d('l10', 'ミナ', '転勤。急に決まって。'),
      d('l11', 'ソウタ', 'そっか。……おめでとう、って言えばいいのかな。'),
      d('l12', 'ミナ', 'うん。笑って送り出してほしいな。'),
    ],
    importedAt: DateTime.now(),
  );
}
