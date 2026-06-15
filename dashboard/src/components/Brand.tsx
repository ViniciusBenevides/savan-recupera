export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="grid place-items-center rounded-[10px] bg-emerald font-display font-800 text-ink-950"
        style={{ width: size, height: size, fontSize: size * 0.55 }}
      >
        R
      </span>
      <span className="font-display text-[17px] font-700 tracking-tight text-chalk">
        SAVAN<span className="text-emerald"> Recupera</span>
      </span>
    </span>
  );
}
