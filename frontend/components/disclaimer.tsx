export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-lg bg-warn-tint px-3.5 py-2.5 text-[13px] leading-snug text-warn ${className}`}
    >
      Bukan pengganti petugas K3. Selalu cek pasal sumber.
    </p>
  );
}
