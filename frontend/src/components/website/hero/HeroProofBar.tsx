export function HeroProofBar({ items }: { items?: string[] }) {
  if (!items?.length) return null;

  return (
    <div className="fm-hero-proof-bar" aria-label="FitMeet 官网首屏证明点">
      {items.slice(0, 3).map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
