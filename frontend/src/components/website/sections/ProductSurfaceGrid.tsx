import { productSurfaces } from '../content/website-content';

export function ProductSurfaceGrid() {
  return (
    <div className="fm-product-surface-grid">
      {productSurfaces.map((surface) => (
        <figure key={surface.title} className="fm-product-surface-card">
          <picture>
            <img
              src={surface.image}
              alt={surface.alt}
              width="1200"
              height="675"
              loading="lazy"
              decoding="async"
            />
          </picture>
          <figcaption>
            <span>{surface.label}</span>
            <strong>{surface.title}</strong>
            <p>{surface.body}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
