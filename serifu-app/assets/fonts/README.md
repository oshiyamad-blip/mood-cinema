# 同梱フォント

Noto Sans JP（SIL Open Font License 1.1、`OFL.txt`）の Regular / Bold を、
アプリの初回読込（特にWeb版）を軽くするためサブセット化して同梱しています。

- 収録文字：Windows-31J（cp932）で表せる全文字（JIS第1・第2水準＋NEC/IBM拡張。
  髙・﨑なども含む）＋ ASCII・Latin-1/拡張A・半角カナ・約物・矢印・丸数字・図形・記号・縦書き約物
- 収録外の文字（例：𠮷）は端末/ブラウザのフォントで表示されます
- 作り直し方（fonttools が必要）：

```bash
python3 make_charset.py charset.txt
for w in Regular Bold; do
  pyftsubset NotoSansJP-$w-original.ttf --text-file=charset.txt --layout-features='*' \
    --glyph-names --symbol-cmap --legacy-cmap --notdef-glyph --notdef-outline \
    --name-IDs='*' --name-legacy --name-languages='*' --output-file=NotoSansJP-$w.ttf
done
```
