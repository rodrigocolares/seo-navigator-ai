export function ScoreRing({ value, label, size = 96 }: { value: number; label: string; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const dash = (v / 100) * c;
  const color = v >= 80 ? "oklch(0.75 0.16 155)" : v >= 60 ? "oklch(0.78 0.16 75)" : "oklch(0.65 0.22 25)";
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="oklch(0.3 0.02 260)" strokeWidth={6} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${c}`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-2xl font-bold" style={{ color }}>{v}</span>
        </div>
      </div>
      <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
