import sys, zipfile, os
from xml.sax.saxutils import escape
out = sys.argv[1]; font = sys.argv[2]
LINES = """タイトル：雨上がりの駅
作：テスト太郎

登場人物
ハルカ　大学生
ケンタ　ハルカの幼なじみ

○駅のホーム・夕方
　雨上がり。ハルカがベンチに座っている。
ケンタ「やっぱりここにいた」
ハルカ「……なんで分かったの」
ケンタ「昔からそうだろ。落ち込むと、いつもこのベンチだ」
ハルカ「落ち込んでなんか、ないよ」
　ケンタ、隣に座る。
ケンタ「電車、もう三本見送ってる」
ハルカ「数えてたの？（笑う）
変なの」
ケンタ「帰ろう。送るよ」
ハルカ「うん」""".split("\n")
open(os.path.join(out, "ame.txt"), "w", encoding="utf-8").write("\n".join(LINES) + "\n")
# --- docx（最小構成を手組み） ---
paras = "".join(f'<w:p><w:r><w:t xml:space="preserve">{escape(l)}</w:t></w:r></w:p>' for l in LINES)
doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{paras}</w:body></w:document>'
with zipfile.ZipFile(os.path.join(out, "ame.docx"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr("word/document.xml", doc)
# --- テキストPDF（NotoSansJP を埋め込み） ---
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont("NotoJP", font))
c = canvas.Canvas(os.path.join(out, "ame.pdf"), pagesize=(595, 842))
c.setFont("NotoJP", 12); y = 800
for l in LINES:
    c.drawString(50, y, l); y -= 20
c.showPage(); c.save()
# --- 画像のみPDF（テキストなし） ---
c = canvas.Canvas(os.path.join(out, "image_only.pdf"), pagesize=(595, 842))
c.rect(100, 400, 300, 200, fill=1); c.showPage(); c.save()
print("ok", sorted(os.listdir(out)))
