// ホンヨミのロゴ/アイコンを生成するツール（通常のテストでは skip）。
//
// 再生成するとき:
//   flutter test --run-skipped test/tools/logo_generator_test.dart
//   dart run flutter_launcher_icons
//
// デザイン: 「本読み」= 吹き出しの中に台本の行（3本のバー）。
// 中央の1本だけアンバー（あなたのセリフ）。青ベース。
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _blue = Color(0xFF2563EB);
const _blueDark = Color(0xFF1D4ED8);
const _blueLight = Color(0xFF93C5FD);
const _amber = Color(0xFFF5A623);

/// 吹き出し＋台本バーのマークを [rect] に描く。
/// [bubbleColor] が吹き出し、バーは [barColor]（中央のみ [accentColor]）。
void _drawMark(Canvas canvas, Rect rect, Color bubbleColor, Color barColor,
    Color accentColor) {
  final w = rect.width;
  final h = rect.height;

  // 吹き出し本体（角丸長方形）＋左下のしっぽ。
  final bubble = RRect.fromRectAndRadius(
    Rect.fromLTWH(rect.left, rect.top, w, h * 0.78),
    Radius.circular(w * 0.22),
  );
  final tail = Path()
    ..moveTo(rect.left + w * 0.22, rect.top + h * 0.74)
    ..lineTo(rect.left + w * 0.16, rect.top + h)
    ..lineTo(rect.left + w * 0.42, rect.top + h * 0.78)
    ..close();
  final paint = Paint()
    ..color = bubbleColor
    ..isAntiAlias = true;
  canvas.drawRRect(bubble, paint);
  canvas.drawPath(tail, paint);

  // 台本の行（3本のバー）。中央がアクセント＝あなたのセリフ。
  final barHeight = h * 0.095;
  final radius = Radius.circular(barHeight / 2);
  final startX = rect.left + w * 0.18;
  final rows = <({double y, double width, Color color})>[
    (y: rect.top + h * 0.17, width: w * 0.64, color: barColor),
    (y: rect.top + h * 0.35, width: w * 0.46, color: accentColor),
    (y: rect.top + h * 0.53, width: w * 0.56, color: barColor),
  ];
  for (final row in rows) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(startX, row.y, row.width, barHeight),
        radius,
      ),
      Paint()
        ..color = row.color
        ..isAntiAlias = true,
    );
  }
}

Future<void> _savePng(
    void Function(Canvas canvas) draw, int size, String path) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  draw(canvas);
  final image =
      await recorder.endRecording().toImage(size, size);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  File(path)
    ..createSync(recursive: true)
    ..writeAsBytesSync(bytes!.buffer.asUint8List());
}

void main() {
  test('generate logo assets', () async {
    const out = 'assets/logo';
    const s = 1024.0;

    // 1) アプリアイコン（背景あり・iOS/汎用）。
    await _savePng((canvas) {
      final bgPaint = Paint()
        ..shader = ui.Gradient.linear(
          const Offset(0, 0),
          const Offset(s, s),
          [_blue, _blueDark],
        );
      canvas.drawRRect(
        RRect.fromRectAndRadius(
            const Rect.fromLTWH(0, 0, s, s), const Radius.circular(224)),
        bgPaint,
      );
      _drawMark(canvas, const Rect.fromLTWH(s * 0.20, s * 0.22, s * 0.60, s * 0.56),
          Colors.white, _blueLight, _amber);
    }, 1024, '$out/app_icon.png');

    // 2) Androidアダプティブアイコンの前景（背景透過・セーフゾーン考慮で小さめ）。
    await _savePng((canvas) {
      _drawMark(canvas, const Rect.fromLTWH(s * 0.28, s * 0.30, s * 0.44, s * 0.40),
          Colors.white, _blueLight, _amber);
    }, 1024, '$out/app_icon_foreground.png');

    // 3) アプリ内表示用マーク（透過背景・青い吹き出し）。ホーム画面ヘッダー等で使用。
    await _savePng((canvas) {
      const m = 512.0;
      final rect = const Rect.fromLTWH(m * 0.06, m * 0.08, m * 0.88, m * 0.84);
      final gradientPaint = Paint()
        ..shader = ui.Gradient.linear(
          rect.topLeft,
          rect.bottomRight,
          [_blue, _blueDark],
        );
      // グラデーション塗りの吹き出しにするため、一旦レイヤーに白で描いてから合成。
      canvas.saveLayer(const Rect.fromLTWH(0, 0, m, m), Paint());
      _drawMark(canvas, rect, Colors.white, Colors.white, Colors.white);
      canvas.drawRect(
          const Rect.fromLTWH(0, 0, m, m),
          gradientPaint..blendMode = BlendMode.srcIn);
      canvas.restore();
      // バーを上書き（白＋アンバー）。
      final w = rect.width;
      final h = rect.height;
      final barHeight = h * 0.095;
      final radius = Radius.circular(barHeight / 2);
      final startX = rect.left + w * 0.18;
      final rows = <({double y, double width, Color color})>[
        (y: rect.top + h * 0.17, width: w * 0.64, color: Colors.white),
        (y: rect.top + h * 0.35, width: w * 0.46, color: _amber),
        (y: rect.top + h * 0.53, width: w * 0.56, color: Colors.white),
      ];
      for (final row in rows) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(startX, row.y, row.width, barHeight),
            radius,
          ),
          Paint()
            ..color = row.color
            ..isAntiAlias = true,
        );
      }
    }, 512, '$out/mark.png');

    expect(File('$out/app_icon.png').existsSync(), isTrue);
  }, skip: 'ロゴ再生成時のみ手動実行（--run-skipped）');
}
