import { useSeo } from '../lib/seo';

export default function Contact() {
  useSeo({
    title: 'お問い合わせ | Tsumugi',
    description: 'Tsumugi へのお問い合わせはこちら。ご意見・ご要望・取材依頼などをお寄せください。',
  });
  return (
    <div className="container article">
      <h1>お問い合わせ</h1>
      <div className="article__body">
        <p>
          サイトへのご意見・ご要望・不具合報告・取材依頼などは、以下のフォームよりお寄せください。返信が必要な場合は 3 営業日以内を目安にご返信いたします。
        </p>
        <p>
          ※ 公開後、Google Form の埋め込み URL をここに差し替えてください。
        </p>
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px dashed var(--color-border)',
            borderRadius: 12,
            padding: '40px 16px',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          [Google Form 埋め込み予定]
        </div>
      </div>
    </div>
  );
}
