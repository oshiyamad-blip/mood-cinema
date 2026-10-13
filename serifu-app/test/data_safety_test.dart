import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/data/safe_file.dart';
import 'package:serifu_app/data/script_store.dart';
import 'package:serifu_app/models/script.dart';

Script _script(String id) => Script(
      id: id,
      title: '台本$id',
      characters: const ['太郎'],
      lines: [Line(id: 'l0', type: LineType.dialogue, speaker: '太郎', text: 'やあ')],
      importedAt: DateTime(2026, 1, 1),
    );

void main() {
  group('台本の読み込み（1件の破損で全台本を失わない）', () {
    test('壊れた1件だけを飛ばし、残りは読み込む', () {
      final good1 = _script('a').toJson();
      final good2 = _script('b').toJson();
      final raw = jsonEncode([good1, {'id': 'broken', 'lines': 'これは配列ではない'}, good2]);
      final r = ScriptStore.decodeTolerant(raw);
      expect(r.scripts.map((s) => s.id), ['a', 'b']);
      expect(r.skipped, 1);
    });

    test('正常なデータは従来どおり往復できる', () {
      final raw = ScriptStore.encode([_script('a'), _script('b')]);
      expect(ScriptStore.decode(raw).map((s) => s.id), ['a', 'b']);
    });
  });

  group('安全な書き込み', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('honyomi_safe_'));
    tearDown(() => dir.deleteSync(recursive: true));

    test('長さの違う内容を同時に書いても、最後の内容がそのまま残る（混ざらない）', () async {
      final f = File('${dir.path}/settings.json');
      final writes = <Future<void>>[];
      for (var i = 0; i < 40; i++) {
        // 0.6000000000000001 と 0.7 のように長さが揺れる値を模す。
        final value = i.isEven ? 'x' * (500 + i) : 'y' * (20 + i);
        writes.add(SafeFile.write(f, jsonEncode({'v': value, 'i': i})));
      }
      await Future.wait(writes);
      final decoded = jsonDecode(f.readAsStringSync()) as Map; // 壊れていれば例外
      expect(decoded['i'], 39);
      expect(File('${f.path}.tmp').existsSync(), isFalse); // 一時ファイルが残らない
    });

    test('SerialQueue は順番どおりに1本ずつ実行する', () async {
      final q = SerialQueue();
      final order = <int>[];
      await Future.wait([
        for (var i = 0; i < 5; i++)
          q.run(() async {
            await Future<void>.delayed(Duration(milliseconds: 20 - i * 3));
            order.add(i);
          }),
      ]);
      expect(order, [0, 1, 2, 3, 4]);
    });
  });
}
