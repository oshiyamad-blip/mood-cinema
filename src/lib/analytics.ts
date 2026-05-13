declare function gtag(...args: unknown[]): void;

const ga = (...args: unknown[]) => {
  if (typeof gtag !== 'undefined') gtag(...args);
};

export const track = {
  balloonSelect:   (id: string, category: string) =>
    ga('event', 'balloon_select', { balloon_id: id, category }),
  balloonDeselect: (id: string) =>
    ga('event', 'balloon_deselect', { balloon_id: id }),
  resultView:      (combo: string) =>
    ga('event', 'result_view', { balloon_combo: combo }),
  affiliateClick:  (provider: 'unext' | 'amazon', movieId: number) =>
    ga('event', 'affiliate_click', { provider, movie_id: movieId }),
};
