interface Props {
  title: string;
  url: string;
}

export default function ShareButtons({ title, url }: Props) {
  const text = encodeURIComponent(`${title} #mood_cinema`);
  const u = encodeURIComponent(url);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert('URL をコピーしました');
    } catch {
      window.prompt('URL をコピーしてください', url);
    }
  };
  return (
    <div className="share-buttons">
      <a
        href={`https://twitter.com/intent/tweet?text=${text}&url=${u}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        X (Twitter) に投稿
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${u}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Facebook
      </a>
      <button type="button" onClick={handleCopy}>URL コピー</button>
    </div>
  );
}
