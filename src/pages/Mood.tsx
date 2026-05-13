import { useSearchParams, useNavigate } from 'react-router-dom';
import { BALLOONS, BALLOON_MAP } from '../data/balloons';
import { pickRandomBalloons } from '../lib/balloonMapper';
import { track } from '../lib/analytics';
import { useSeo } from '../lib/seo';

const MIN_SELECT = 2;
const MAX_SELECT = 6;

export default function Mood() {
  useSeo({
    title: '今夜の気分を選ぶ | mood-cinema',
    description: '好きなバルーンを 2〜6 個タップして、今夜ぴったりの映画を見つけよう。',
    canonicalPath: '/mood',
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedIds: string[] = (searchParams.get('s') ?? '')
    .split(',').filter(id => id && BALLOON_MAP[id]);

  const setSelected = (ids: string[]) => {
    setSearchParams(ids.length ? { s: ids.join(',') } : {}, { replace: true });
  };

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      track.balloonDeselect(id);
      setSelected(selectedIds.filter(x => x !== id));
    } else if (selectedIds.length < MAX_SELECT) {
      const balloon = BALLOON_MAP[id];
      if (balloon) track.balloonSelect(id, balloon.category);
      setSelected([...selectedIds, id]);
    }
  };

  const handleRandom = () => {
    setSelected(pickRandomBalloons(BALLOONS));
  };

  const goResult = () => {
    if (selectedIds.length < MIN_SELECT) return;
    navigate(`/result?b=${selectedIds.join(',')}`);
  };

  const canSubmit = selectedIds.length >= MIN_SELECT;
  const selectedBalloons = selectedIds.map(id => BALLOON_MAP[id]).filter(Boolean);

  return (
    <div className="container mood-page">
      <div className="mood-header">
        <h1>今夜の気分を選ぼう</h1>
        <p className="mood-header__sub">気になるワードを {MIN_SELECT}〜{MAX_SELECT} 個タップ</p>
        <button type="button" className="btn btn--random" onClick={handleRandom}>
          ↺ ランダムで選ぶ
        </button>
      </div>

      {selectedBalloons.length > 0 && (
        <div className="balloon-tray" aria-label="選択中のバルーン">
          {selectedBalloons.map(b => (
            <button
              key={b.id}
              type="button"
              className="balloon-tray__chip"
              onClick={() => toggle(b.id)}
              aria-label={`${b.label}を外す`}
            >
              {b.emoji}{b.label} ×
            </button>
          ))}
          <span className="balloon-tray__count">{selectedIds.length}/{MAX_SELECT}</span>
        </div>
      )}

      <div className="balloon-grid balloon-grid--all">
        {BALLOONS.map(b => {
          const isSelected = selectedIds.includes(b.id);
          const isDisabled = !isSelected && selectedIds.length >= MAX_SELECT;
          return (
            <button
              key={b.id}
              type="button"
              className={`balloon-chip${isSelected ? ' balloon-chip--selected' : ''}${isDisabled ? ' balloon-chip--disabled' : ''}`}
              data-cat={b.category}
              onClick={() => !isDisabled && toggle(b.id)}
              aria-pressed={isSelected}
            >
              <span className="balloon-chip__emoji">{b.emoji}</span>
              <span className="balloon-chip__label">{b.label}</span>
            </button>
          );
        })}
      </div>

      <div className="submit-bar">
        <button
          type="button"
          className="btn btn--primary submit-bar__btn"
          onClick={goResult}
          disabled={!canSubmit}
        >
          {canSubmit
            ? `この ${selectedIds.length} つで映画を探す →`
            : `あと ${MIN_SELECT - selectedIds.length} 個選んでね`}
        </button>
      </div>
    </div>
  );
}
