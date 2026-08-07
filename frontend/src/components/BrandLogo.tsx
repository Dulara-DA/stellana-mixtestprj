interface BrandLogoProps {
  className?: string
  eager?: boolean
}

export function BrandLogo({ className = '', eager = false }: BrandLogoProps) {
  return (
    <img
      src="/brand/stellana-logo.png"
      alt="Stellana, a HEXPOL company"
      width={720}
      height={385}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={`block object-contain ${className}`}
    />
  )
}
