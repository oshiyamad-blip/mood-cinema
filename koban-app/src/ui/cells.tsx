// 表の中の入力欄。打つたびに保存せず、離れたとき（Enter・Tab・外を押す）に確定する。

import { useEffect, useState } from 'react';
import { formatTime, parseTime } from '../core/time';

interface TextProps {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  type?: string;
}

export function CellInput({ value, onCommit, label, placeholder, className, type }: TextProps) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      type={type}
      className={className}
      value={v}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v === value) return;
        onCommit(v);
        // 確定後は親から来る値（正規化済み）を表示する。読めない値は元に戻る
        setV(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(value);
      }}
    />
  );
}

interface NumProps {
  value: number | null;
  onCommit: (v: number | null) => void;
  label: string;
  placeholder?: string;
}

export function NumInput({ value, onCommit, label, placeholder }: NumProps) {
  return (
    <CellInput
      className="num"
      value={value == null ? '' : String(value)}
      label={label}
      placeholder={placeholder}
      onCommit={(s) => {
        const t = s.trim();
        if (t === '') return onCommit(null);
        const n = Number(t.normalize('NFKC'));
        onCommit(Number.isFinite(n) && n >= 0 ? n : value);
      }}
    />
  );
}

interface TimeProps {
  value: number | null;
  onCommit: (v: number | null) => void;
  label: string;
  allowEmpty?: boolean;
  placeholder?: string;
}

/** 時刻の入力。「25:30」「830」「8時半」を受け付ける。読めない値は元に戻す */
export function TimeInput({ value, onCommit, label, allowEmpty, placeholder }: TimeProps) {
  return (
    <CellInput
      className="time-in"
      value={formatTime(value)}
      label={label}
      placeholder={placeholder ?? '8:00'}
      onCommit={(s) => {
        if (s.trim() === '') return allowEmpty ? onCommit(null) : onCommit(value);
        const t = parseTime(s);
        onCommit(t ?? value);
      }}
    />
  );
}
