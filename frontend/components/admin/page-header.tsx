/** Title, one-line purpose and (optional) primary actions at the top of every admin page. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h1 className="m-0 font-heading text-[28px] font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        <p className="m-0 text-[15px] leading-relaxed text-ink-muted">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
