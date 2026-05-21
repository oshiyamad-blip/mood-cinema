import { useSearchParams, useNavigate } from 'react-router-dom';
import { BALLOONS, BALLOON_MAP } from '../data/balloons';
import { pickRandomBalloons } from '../lib/balloonMapper';
import { track } from '../lib/analytics';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n';

const MIN_SELECT = 2;
const MAX_SELECT = 6;

export default function Mood() {
  const { t, prefix, lang } = useI18n();

  useSeo({
    title: t.mood.title,
    description: t.mood.description,
    canonicalPath: `${prefix}/mood`,
    lang,
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

  const handleRandom = () => { setSelected(pickRandomBalloons(BALLOONS)); };

  const goResult = () => {
    if (selectedIds.length < MIN_SELECT) return;
    navigate(`${prefix}/result?b=${selectedIds.join(',')}`);
  };

  const canSubmit = selectedIds.length >= MIN_SELECT;
  const selectedBalloons = selectedIds.map(id => BALLOON_MAP[id]).filter(Boolean);

  return (
    <div className="container mood-page">
      <div className="mood-header">
        <h1>{t.mood.heading}</h1>
        <p className="mood-header__sub">{t.mood.subheading(MIN_SELECT, MAX_SELECT)}</p>
        <button type="button" className="btn btn--random" onClick={handleRandom}>
          {t.mood.randomBtn}
        </button>
      </div>

      {selectedBalloons.length > 0 && (
        <div className="balloon-tray" aria-label={t.mood.trayLabel}>
          {selectedBalloons.map(b => (
            <button
              key={b.id}
              type="button"
              className="balloon-tray__chip"
              onClick={() => toggle(b.id)}
              aria-label={t.mood.trayRemove(t.balloonLabel[b.id] ?? b.label)}
            >
              {b.emoji}{t.balloonLabel[b.id] ?? b.label} ×
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
              <span className="balloon-chip__label">{t.balloonLabel[b.id] ?? b.label}</span>
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
            ? t.mood.submitReady(selectedIds.length)
            : t.mood.submitNotReady(MIN_SELECT - selectedIds.length)}
        </button>
      </div>
    </div>
  );
}
