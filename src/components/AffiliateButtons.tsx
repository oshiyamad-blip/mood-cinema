import { amazonSearchUrl, unextSearchUrl } from '../lib/affiliate';

interface Props {
  title: string;
  year?: string;
  unextAvailable?: boolean;
}

export default function AffiliateButtons({ title, year, unextAvailable = true }: Props) {
  return (
    <>
      {unextAvailable && (
        <a
          className="btn btn--unext"
          href={unextSearchUrl(title)}
          target="_blank"
          rel="sponsored noopener noreferrer"
        >
          U-NEXT で観る
        </a>
      )}
      <a
        className="btn btn--amazon"
        href={amazonSearchUrl(title, year)}
        target="_blank"
        rel="sponsored noopener noreferrer"
      >
        Amazon で観る
      </a>
    </>
  );
}
