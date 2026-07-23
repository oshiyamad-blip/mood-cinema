import 'dart:math' as math;

/// PDFの文字断片（グリフ/テキストラン）1つ。座標はPDFポイント。
class GlyphRun {
  GlyphRun({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    required this.text,
  });
  final double x;
  final double y;
  final double width;
  final double height;
  final String text;
}

/// PDFのレイアウト情報から「視覚上の行」を復元する（純Dart・端末内処理）。
///
/// 日本語台本のPDFは縦書きが多く、素朴なテキスト抽出では1文字ずつ
/// バラバラの行になってしまう。そこで座標を使って行を組み立て直す：
///   - 縦書きページ … x座標で「列」をクラスタリングし、右の列から左へ、
///     列内は上から下へ読む。1列 = 台本の1行。
///   - 横書きページ … y座標で「行」をクラスタリングし、上から下へ、
///     行内は左から右へ読む。
///   - 全ページで繰り返されるヘッダー/フッター（応募用紙の定型文や
///     ページ番号など）は自動除去する。
///   - 行間が通常の約2倍以上あいた場所には空行を入れる（段落境界）。
class PdfLayoutText {
  /// ページごとのグリフ一覧から全文テキストを復元する。
  static String reconstruct(List<List<GlyphRun>> pages) {
    final pageLines = <List<String>>[];
    for (final glyphs in pages) {
      pageLines.add(_reconstructPage(glyphs));
    }
    _removeFurniture(pageLines);

    final buf = StringBuffer();
    for (final lines in pageLines) {
      for (final l in lines) {
        buf.writeln(l);
      }
    }
    return buf.toString();
  }

  /// 1ページ分の行復元。
  static List<String> _reconstructPage(List<GlyphRun> glyphs) {
    final items = glyphs.where((g) => g.text.trim().isNotEmpty).toList();
    if (items.isEmpty) return const [];

    // 縦書き判定：ランのアスペクト比の多数決。
    //   - 縦長のラン（高さ＞幅）… 縦書きの証拠（複数文字が縦に連結されたラン）
    //   - 正方形の1文字ラン … 縦書きの証拠（縦書きは1文字ずつ取れることが多い）
    //   - 横長の複数文字ラン … 横書きの証拠
    var verticalEvidence = 0;
    var horizontalEvidence = 0;
    for (final g in items) {
      final len = g.text.trim().length;
      if (g.height > g.width * 1.2) {
        verticalEvidence++;
      } else if (len == 1 && g.width <= math.max(g.height, 1) * 1.2) {
        verticalEvidence++;
      } else if (len > 1 && g.width > g.height * 1.2) {
        horizontalEvidence++;
      }
    }
    final vertical =
        items.length >= 10 && verticalEvidence > horizontalEvidence;

    return vertical ? _verticalLines(items) : _horizontalLines(items);
  }

  /// 縦書き：x座標で列を作り、右の列から左へ。
  ///
  /// **段組対応**: ワークショップ台本などでは1ページに上下2段
  /// （それぞれが右→左の縦書きブロック）で組まれることがある。
  /// ページ全体で列を作ると上下の段が同じ列に合流し、物語の前半と後半が
  /// 行単位で交互に混ざってしまう。そこで先にy射影で「段」を分け、
  /// 上の段→下の段の順に、段ごとに右→左で読む。
  static List<String> _verticalLines(List<GlyphRun> items) {
    // 横書きの混入物（ページ番号・ヘッダー等、幅が高さの2倍超のラン）は
    // 列に混ぜず、独立した行として先頭に出す（後段の定型除去で消える）。
    final horiz = <GlyphRun>[];
    final vert = <GlyphRun>[];
    for (final g in items) {
      if (g.text.trim().length > 1 && g.width > g.height * 2) {
        horiz.add(g);
      } else {
        vert.add(g);
      }
    }

    final lines = <String>[];
    for (final g in horiz) {
      lines.add(g.text.trim());
    }
    for (final band in _splitBands(vert)) {
      lines.addAll(_bandToLines(band));
    }
    return lines;
  }

  /// y射影で上下の「段」に分ける。どの列にもグリフが無い縦方向の空きが
  /// 文字セル約2つぶん以上あれば段の境界とみなす（1段組なら分割されない。
  /// 列内の意図的な字下げ空きは他の列が同じy帯を埋めるため境界にならない）。
  /// 段をまたぐ本文は連続した流れなので、段間に空行は入れない。
  static List<List<GlyphRun>> _splitBands(List<GlyphRun> items) {
    if (items.isEmpty) return const [];
    final sorted = [...items]..sort((a, b) => a.y.compareTo(b.y));
    final heights = [for (final g in sorted) g.height]..sort();
    final cell = math.max(heights[heights.length ~/ 2], 1.0);

    final bands = <List<GlyphRun>>[];
    var bandEnd = double.negativeInfinity;
    for (final g in sorted) {
      if (bands.isEmpty || g.y > bandEnd + cell * 1.8) {
        bands.add([g]);
        bandEnd = g.y + g.height;
      } else {
        bands.last.add(g);
        bandEnd = math.max(bandEnd, g.y + g.height);
      }
    }
    return bands;
  }

  /// 1段ぶんの縦書きグリフを、右の列から左へ行に組み立てる。
  static List<String> _bandToLines(List<GlyphRun> vert) {
    // 列クラスタリング：xを降順に並べ、間隔が閾値を超えたら新しい列。
    vert.sort((a, b) => b.x.compareTo(a.x));
    final columns = <List<GlyphRun>>[];
    const tol = 6.0; // 同一列とみなすxのゆらぎ（全角13pt・列間隔22pt前後）
    for (final g in vert) {
      if (columns.isEmpty || (columns.last.first.x - g.x) > tol) {
        columns.add([g]);
      } else {
        columns.last.add(g);
      }
    }

    // 列間隔の中央値を求め、大きく空いた場所を段落境界（空行）にする。
    final gaps = <double>[];
    for (var i = 1; i < columns.length; i++) {
      gaps.add(columns[i - 1].first.x - columns[i].first.x);
    }
    final pitch = _median(gaps);

    final lines = <String>[];
    for (var i = 0; i < columns.length; i++) {
      if (i > 0 && pitch > 0) {
        final gap = columns[i - 1].first.x - columns[i].first.x;
        if (gap > pitch * 1.8) lines.add('');
      }
      final col = columns[i]..sort((a, b) => a.y.compareTo(b.y));
      lines.add(_joinColumn(col));
    }
    return lines;
  }

  /// 列内のグリフを連結する。文字セル1つぶん以上の縦の空きがあれば
  /// 全角空白を入れる（「役名␣␣セリフ」形式の区切りを保存するため。
  /// 空白グリフ自体は抽出時に落ちることが多い）。
  static String _joinColumn(List<GlyphRun> col) {
    final buf = StringBuffer();
    for (var i = 0; i < col.length; i++) {
      if (i > 0) {
        final prev = col[i - 1];
        final gap = col[i].y - (prev.y + prev.height);
        final cell = math.max(prev.height, col[i].height);
        if (cell > 0 && gap > cell * 0.5) buf.write('　');
      }
      buf.write(col[i].text.trim());
    }
    return buf.toString();
  }

  /// 横書き：y座標で行を作り、上から下へ。
  ///
  /// **段組対応**: ワークショップ台本などでは1ページを左右2段
  /// （それぞれが横書きブロック）で組むことがある。ページ全体で行を作ると
  /// 左右の段が同じ行に合流し、物語の前半と後半が行単位で交互に混ざって
  /// しまう。そこで先にx射影で「段」を分け、左の段→右の段の順に読む。
  static List<String> _horizontalLines(List<GlyphRun> items) {
    final lines = <String>[];
    for (final column in _splitHorizontalColumns(items)) {
      lines.addAll(_rowsToLines(column));
    }
    return lines;
  }

  /// x射影で左右の「段」に分ける。どの行のx区間にも覆われない横方向の
  /// 空き（段間の溝）が文字セル約1.5個ぶん以上あれば段の境界とみなす。
  /// 1段組では長い行がページ幅を覆うため分割されない。
  static List<List<GlyphRun>> _splitHorizontalColumns(List<GlyphRun> items) {
    if (items.isEmpty) return const [];
    final sorted = [...items]..sort((a, b) => a.x.compareTo(b.x));
    final heights = [for (final g in sorted) g.height]..sort();
    final cell = math.max(heights[heights.length ~/ 2], 1.0);

    final columns = <List<GlyphRun>>[];
    var colEnd = double.negativeInfinity;
    for (final g in sorted) {
      if (columns.isEmpty || g.x > colEnd + cell * 1.5) {
        columns.add([g]);
        colEnd = g.x + g.width;
      } else {
        columns.last.add(g);
        colEnd = math.max(colEnd, g.x + g.width);
      }
    }
    return columns;
  }

  /// 1段ぶんの横書きグリフを、上から下へ行に組み立てる。
  static List<String> _rowsToLines(List<GlyphRun> items) {
    items.sort((a, b) => a.y.compareTo(b.y));
    final rows = <List<GlyphRun>>[];
    for (final g in items) {
      final tol = math.max(g.height, 10) * 0.6;
      if (rows.isEmpty || (g.y - rows.last.first.y).abs() > tol) {
        rows.add([g]);
      } else {
        rows.last.add(g);
      }
    }

    final gaps = <double>[];
    for (var i = 1; i < rows.length; i++) {
      gaps.add(rows[i].first.y - rows[i - 1].first.y);
    }
    final pitch = _median(gaps);

    final lines = <String>[];
    for (var i = 0; i < rows.length; i++) {
      if (i > 0 && pitch > 0) {
        final gap = rows[i].first.y - rows[i - 1].first.y;
        if (gap > pitch * 1.8) lines.add('');
      }
      final row = rows[i]..sort((a, b) => a.x.compareTo(b.x));
      lines.add(row.map((g) => g.text.trim()).join());
    }
    return lines;
  }

  /// 全ページで繰り返される定型行（ヘッダー/フッター）を除去。
  ///
  /// ページの先頭・末尾2行のうち、数字を除いて正規化したテキストが
  /// 3ページ以上で繰り返されるものを「ページの飾り」とみなして取り除く。
  /// 本文を誤爆しないよう、ページ端の行だけを対象にし、キーは6文字以上、
  /// かつセリフ形式（カギカッコ入り）の行は対象外とする
  /// （ページ番号だけの行は解析器側で無視される）。
  static void _removeFurniture(List<List<String>> pageLines) {
    if (pageLines.length < 3) return;
    bool isEdge(int idx, int len) => idx < 2 || idx >= len - 2;
    bool isCandidate(String line) =>
        !line.contains('「') && !line.contains('『');

    final pageCount = <String, Set<int>>{};
    for (var p = 0; p < pageLines.length; p++) {
      final lines = pageLines[p];
      for (var i = 0; i < lines.length; i++) {
        if (!isEdge(i, lines.length)) continue;
        if (!isCandidate(lines[i])) continue;
        final key = _furnitureKey(lines[i]);
        if (key.length < 6) continue;
        pageCount.putIfAbsent(key, () => <int>{}).add(p);
      }
    }
    final furniture = pageCount.entries
        .where((e) => e.value.length >= 3)
        .map((e) => e.key)
        .toSet();
    if (furniture.isEmpty) return;
    for (var p = 0; p < pageLines.length; p++) {
      final lines = pageLines[p];
      pageLines[p] = [
        for (var i = 0; i < lines.length; i++)
          if (!(isEdge(i, lines.length) &&
              furniture.contains(_furnitureKey(lines[i]))))
            lines[i],
      ];
    }
  }

  static String _furnitureKey(String line) =>
      line.replaceAll(RegExp(r'[0-9０-９\s　]'), '');

  static double _median(List<double> xs) {
    if (xs.isEmpty) return 0;
    final s = [...xs]..sort();
    final mid = s.length ~/ 2;
    return s.length.isOdd ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
}
