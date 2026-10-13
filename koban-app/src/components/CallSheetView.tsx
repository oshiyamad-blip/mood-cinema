// 日々スケの表示。編集画面のプレビュー・印刷（PDF）と、閲覧ページで同じものを使う。
// core 以外を読み込まない（閲覧ページを軽く保つため）。

import type { CallSheetDoc } from '../core/callsheet';
import { formatDateLong, formatTime } from '../core/time';

interface Props {
  doc: CallSheetDoc;
  versionN?: number;
  /** この人の行を強調する */
  highlightPersonId?: string | null;
}

const INT_EXT: Record<string, string> = { INT: '内', EXT: '外', 'INT/EXT': '内外', '': '' };

export function CallSheetView({ doc, versionN, highlightPersonId }: Props) {
  const staffByDept = new Map<string, typeof doc.staff>();
  for (const s of doc.staff) staffByDept.set(s.dept, [...(staffByDept.get(s.dept) ?? []), s]);
  const textBlocks: [string, string][] = (
    [
      ['注意事項', doc.notices],
      ['食事', doc.meals],
      ['移動', doc.moves],
      ['メモ', doc.note],
    ] as [string, string][]
  ).filter(([, t]) => t.trim() !== '');

  return (
    <article className="cs">
      <header className="cs-head">
        <div>
          <p className="cs-title">{doc.projectTitle}</p>
          <h2 className="cs-date">{formatDateLong(doc.date)}</h2>
        </div>
        <p className="cs-meta num">
          {doc.dayN > 0 && (
            <span>
              撮影 {doc.dayN}日目／全{doc.dayTotal}日
            </span>
          )}
          {versionN != null && <span>第{versionN}版</span>}
        </p>
      </header>

      <section className="cs-key" aria-label="集合と場所">
        <dl>
          <div>
            <dt>全体の集合</dt>
            <dd className="cs-big num">{formatTime(doc.generalCall)}</dd>
          </div>
          <div>
            <dt>撤収予定</dt>
            <dd className="num">{formatTime(doc.wrapPlan) || '未定'}</dd>
          </div>
          <div>
            <dt>撤収見込み</dt>
            <dd className="num">{formatTime(doc.estEnd)}</dd>
          </div>
          {doc.weather && (
            <div>
              <dt>天気</dt>
              <dd>{doc.weather}</dd>
            </div>
          )}
        </dl>
        {doc.locations.length > 0 && (
          <ul className="cs-locs">
            {doc.locations.map((l) => (
              <li key={l.id}>
                <strong>{l.name}</strong>
                {l.meetingPoint && <span>集合場所：{l.meetingPoint}</span>}
                {l.address && <span>{l.address}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="香盤（撮影順）">
        <h3>撮影順</h3>
        <div className="cs-scroll">
          <table className="cs-table">
            <thead>
              <tr>
                <th scope="col">時刻</th>
                <th scope="col">S#</th>
                <th scope="col">柱</th>
                <th scope="col">時間帯</th>
                <th scope="col">内外</th>
                <th scope="col">P</th>
                <th scope="col">出演</th>
                <th scope="col">内容</th>
              </tr>
            </thead>
            <tbody>
              {doc.rows.map((r, i) =>
                r.kind === 'break' ? (
                  <tr key={i} className="cs-break">
                    <td className="num">{formatTime(r.start)}</td>
                    <td colSpan={7}>
                      {r.label}（〜{formatTime(r.end)}）
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className={highlightPersonId && r.castIds.includes(highlightPersonId) ? 'cs-mine' : undefined}>
                    <td className="num">{formatTime(r.start)}</td>
                    <td className="num cs-no">{r.sceneNo}</td>
                    <td>
                      {r.heading}
                      {r.locationName && r.locationName !== r.heading && <span className="cs-sub">{r.locationName}</span>}
                    </td>
                    <td>{r.timeOfDay}</td>
                    <td>{INT_EXT[r.intExt] ?? r.intExt}</td>
                    <td className="num">{r.pages ?? ''}</td>
                    <td>{r.castNames.join('、')}</td>
                    <td className="cs-syn">{r.synopsis}</td>
                  </tr>
                ),
              )}
              {doc.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="cs-empty">
                    シーンがまだ入っていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="cs-cols">
        {doc.cast.length > 0 && (
          <section aria-label="キャストの入り">
            <h3>キャスト</h3>
            <table className="cs-table">
              <thead>
                <tr>
                  <th scope="col">名前</th>
                  <th scope="col">役</th>
                  <th scope="col">入り</th>
                  <th scope="col">出番</th>
                </tr>
              </thead>
              <tbody>
                {doc.cast.map((c) => (
                  <tr key={c.personId} className={c.personId === highlightPersonId ? 'cs-mine' : undefined}>
                    <td>
                      {c.name}
                      {c.agency && <span className="cs-sub">{c.agency}</span>}
                    </td>
                    <td>{c.role}</td>
                    <td className="num cs-call">{formatTime(c.call)}</td>
                    <td className="num">{c.sceneNos.join('・')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {staffByDept.size > 0 && (
          <section aria-label="スタッフの集合">
            <h3>スタッフ</h3>
            <table className="cs-table">
              <thead>
                <tr>
                  <th scope="col">部署</th>
                  <th scope="col">集合</th>
                  <th scope="col">人</th>
                </tr>
              </thead>
              <tbody>
                {doc.deptCalls.map((d) => (
                  <tr key={d.dept} className={staffByDept.get(d.dept)?.some((s) => s.personId === highlightPersonId) ? 'cs-mine' : undefined}>
                    <td>{d.dept}</td>
                    <td className="num cs-call">{formatTime(d.call)}</td>
                    <td>
                      {(staffByDept.get(d.dept) ?? []).map((s) => (
                        <span key={s.personId} className="cs-person">
                          {s.name}
                          {s.call !== d.call && <span className="num">（{formatTime(s.call)}）</span>}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {(doc.prep.length > 0 || doc.deptNotes.length > 0) && (
        <section aria-label="各部の準備">
          <h3>各部の準備</h3>
          <dl className="cs-prep">
            {doc.prep.map((g) => (
              <div key={g.category}>
                <dt>{g.category}</dt>
                <dd>
                  {g.items.map((it) => (
                    <span key={it.name} className="cs-person">
                      {it.name}
                      <span className="cs-sub num">S#{it.sceneNos.join('・')}</span>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
            {doc.deptNotes.map((n) => (
              <div key={`note-${n.dept}`}>
                <dt>{n.dept}</dt>
                <dd className="cs-pre">{n.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {textBlocks.length > 0 && (
        <section className="cs-texts" aria-label="連絡事項">
          {textBlocks.map(([label, text]) => (
            <div key={label}>
              <h3>{label}</h3>
              <p className="cs-pre">{text}</p>
            </div>
          ))}
        </section>
      )}

      {doc.contacts.length > 0 && (
        <section aria-label="連絡先">
          <h3>連絡先</h3>
          <ul className="cs-contacts">
            {doc.contacts.map((c) => (
              <li key={c.personId}>
                <span>
                  {c.dept && `${c.dept} `}
                  {c.role && `${c.role} `}
                  {c.name}
                </span>
                {c.phone ? (
                  <a className="num" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>
                    {c.phone}
                  </a>
                ) : (
                  <span className="cs-sub">番号は配る人に確認</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
