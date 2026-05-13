import { useEffect } from 'react';

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;

interface Props {
  slot?: string;
  format?: string;
  label?: string;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function AdBanner({ slot, format = 'auto', label = '広告' }: Props) {
  useEffect(() => {
    if (!CLIENT || !slot) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ignore */
    }
  }, [slot]);

  if (!CLIENT || !slot) {
    return <div className="ad-banner" aria-hidden>広告枠 (AdSense 承認後に表示)</div>;
  }

  return (
    <div className="ad-banner" aria-label={label}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%' }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
