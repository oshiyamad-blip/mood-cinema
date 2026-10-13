# 字形を残す文字集合：Windows-31J(cp932)で表せる全文字＋よく使う記号・欧文
import sys
chars = set()
for hi in range(0x81, 0xFD):
    for lo in range(0x40, 0xFD):
        try:
            chars.add(bytes([hi, lo]).decode('cp932'))
        except UnicodeDecodeError:
            pass
for c in range(0x20, 0x7F): chars.add(chr(c))          # ASCII
for c in range(0xA0, 0x180): chars.add(chr(c))         # Latin-1・Latin拡張A（欧文の名前）
for c in range(0xFF61, 0xFFA0): chars.add(chr(c))      # 半角カナ
for lo, hi in [(0x2000, 0x206F), (0x2190, 0x21FF), (0x2460, 0x24FF), (0x25A0, 0x25FF), (0x2600, 0x26FF), (0x3000, 0x30FF), (0x31F0, 0x31FF), (0xFE30, 0xFE4F)]:
    for c in range(lo, hi + 1): chars.add(chr(c))      # 約物・矢印・丸数字・図形・記号・かな・縦書き約物
open(sys.argv[1], 'w', encoding='utf-8').write(''.join(sorted(chars)))
print(len(chars), 'chars')
