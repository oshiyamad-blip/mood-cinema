import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/audio/my_take_store.dart';

void main() {
  late Directory tmp;
  late MyTakeStore store;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('mytake_test_');
    store = MyTakeStore(baseDirProvider: () async => tmp);
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  test('pathFor は台本/行ごとのパスを返しディレクトリを作る', () async {
    final path = await store.pathFor('s1', 'l1');
    expect(path, endsWith('/recordings/s1/mytake/l1.m4a'));
    expect(await Directory('${tmp.path}/recordings/s1/mytake').exists(), isTrue);
  });

  test('loadAll は録音済みの lineId → パスを返す', () async {
    await File(await store.pathFor('s1', 'a')).writeAsBytes([1]);
    await File(await store.pathFor('s1', 'b')).writeAsBytes([2]);
    final map = await store.loadAll('s1');
    expect(map.keys.toSet(), {'a', 'b'});
  });

  test('clear で直近分が消える（新しい練習の開始時）', () async {
    await File(await store.pathFor('s1', 'a')).writeAsBytes([1]);
    await store.clear('s1');
    expect(await store.loadAll('s1'), isEmpty);
  });

  test('録音が無い台本は空マップ（エラーにしない）', () async {
    expect(await store.loadAll('none'), isEmpty);
  });
}
