/** Hero illustration: how a verified answer is built. Purely schematic (grey bars stand in for
 *  text), so it never shows invented regulation wording. */

const bar = (w: string, extra = "") =>
  `h-2.5 rounded-full bg-line ${extra}` + ` ${w}`;

function Chip({ n }: { n: number }) {
  return (
    <span className="mx-0.5 inline-flex size-6 items-center justify-center rounded-md bg-cite-tint text-[13px] font-semibold text-cite">
      {n}
    </span>
  );
}

export function AnswerAnatomy() {
  return (
    <figure
      className="m-0 flex flex-col gap-4"
      aria-label="Ilustrasi: jawaban dengan sitasi yang membuka PDF di kalimat yang dikutip"
    >
      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-[0_2px_4px_rgba(28,36,48,0.05),0_24px_48px_-12px_rgba(28,36,48,0.16)] sm:p-6"
      >
        {/* question */}
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-ink-muted">
            ?
          </span>
          <div className="flex flex-1 flex-col gap-2">
            <div className={bar("w-5/6")} />
            <div className={bar("w-1/3")} />
          </div>
        </div>

        {/* answer with citation chips */}
        <div className="mt-5 flex flex-col gap-2.5 rounded-xl bg-ground p-4">
          <div className="flex items-center gap-2">
            <div className={bar("w-2/3", "bg-ink/25")} />
            <Chip n={1} />
          </div>
          <div className={bar("w-full", "bg-ink/25")} />
          <div className="flex items-center gap-2">
            <div className={bar("w-1/2", "bg-ink/25")} />
            <Chip n={2} />
          </div>
        </div>

        {/* source page with the highlighted passage */}
        <div className="mt-4 flex gap-4">
          <div className="relative w-[46%] shrink-0 rounded-lg border border-line bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="h-2 w-2/5 rounded-full bg-slate-300" />
              <div className="h-1.5 w-full rounded-full bg-slate-200" />
              <div className="h-1.5 w-11/12 rounded-full bg-slate-200" />
              <div className="relative -mx-1.5 rounded-md px-1.5 py-1.5">
                <span className="hero-highlight absolute inset-0 rounded-md bg-brand/45" />
                <div className="relative flex flex-col gap-2">
                  <div className="h-1.5 w-full rounded-full bg-slate-500/60" />
                  <div className="h-1.5 w-4/5 rounded-full bg-slate-500/60" />
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200" />
              <div className="h-1.5 w-3/5 rounded-full bg-slate-200" />
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <div className="flex items-center gap-2">
              <Chip n={1} />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className={bar("w-4/5", "bg-ink/25")} />
                <div className={bar("w-1/2")} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Chip n={2} />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className={bar("w-2/3", "bg-ink/25")} />
                <div className={bar("w-2/5")} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="text-sm leading-relaxed text-ink-muted">
        Klik nomor sitasi, dan PDF terbuka di halaman yang benar dengan kalimat
        yang dikutip disorot kuning.
      </figcaption>
    </figure>
  );
}
