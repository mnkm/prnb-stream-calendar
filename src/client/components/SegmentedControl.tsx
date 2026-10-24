import clsx from 'clsx';

/** 並び順などを 1 つ選ぶ、小さな切り替え(radiogroup)。選んでいるものは濃い色で塗る */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** 読み上げ用の名前(「並び順」など) */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit gap-1 self-end rounded-full border border-line p-1">
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition',
            value === option.value ? 'bg-ink text-canvas' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
