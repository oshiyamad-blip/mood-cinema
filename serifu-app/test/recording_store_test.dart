import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/audio/recording_store.dart';

void main() {
  late Directory tmp;
  late RecordingStore store;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('rec_test_');
    store = RecordingStore(baseDirProvider: () async => tmp);
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  test('pathFor はスクリプト/行ごとの m4a パスを返しディレクトリを作る', () async {
    final path = await store.pathFor('s1', 'line1');
    expect(path, endsWith('/recordings/s1/line1.m4a'));
    expect(await Directory('${tmp.path}/recordings/s1').exists(), isTrue);
  });

  test('loadAll は録音済みの lineId → パスを返す', () async {
    await File(await store.pathFor('s1', 'a')).writeAsBytes([1, 2, 3]);
    await File(await store.pathFor('s1', 'b')).writeAsBytes([4]);
    await File(await store.pathFor('s2', 'x')).writeAsBytes([5]); // 別台本

    final map = await store.loadAll('s1');
    expect(map.keys.toSet(), {'a', 'b'});
    expect(map['a'], endsWith('/recordings/s1/a.m4a'));
  });

  test('録音が無い台本は空マップ（エラーにしない）', () async {
    expect(await store.loadAll('nothing'), isEmpty);
  });

  test('delete は1行だけ、deleteAll は台本ごと消す', () async {
    await File(await store.pathFor('s1', 'a')).writeAsBytes([1]);
    await File(await store.pathFor('s1', 'b')).writeAsBytes([2]);

    await store.delete('s1', 'a');
    expect((await store.loadAll('s1')).keys.toList(), ['b']);

    await store.deleteAll('s1');
    expect(await store.loadAll('s1'), isEmpty);
  });

  test('isRecordingPath が録音パスを識別する（練習後クリーンアップの除外用）', () {
    expect(RecordingStore.isRecordingPath('/data/app/recordings/s1/a.m4a'),
        isTrue);
    expect(RecordingStore.isRecordingPath('/tmp/prepared_1234.wav'), isFalse);
  });
}
