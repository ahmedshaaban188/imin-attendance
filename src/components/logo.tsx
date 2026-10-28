/**
 * ImIn | شعار النظام — مونوجرام IMN المعدني داخل بلاطة داكنة + وردمارك أحادي
 * (Im بنص صلب + In داخل شارة حبرية مقلوبة — يتقلب تلقائيًا مع الوضع الداكن)
 */

import Image from "next/image";

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="logo-tile"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      aria-hidden="true"
    >
      <Image
        src="/logo.jpg"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        priority={size >= 56}
      />
    </span>
  );
}

export function Logo({
  size = 40,
  withWordmark = true,
  tagline,
}: {
  size?: number;
  withWordmark?: boolean;
  tagline?: string;
}) {
  return (
    <span className="inline-flex items-center gap-3 no-select">
      <LogoMark size={size} />
      {withWordmark && (
        <span className="flex flex-col leading-tight">
          <span className="text-2xl font-black tracking-tight text-foreground">
            Im<span className="brand-chip">In</span>
          </span>
          {tagline && (
            <span className="text-[11px] font-semibold text-muted-foreground">{tagline}</span>
          )}
        </span>
      )}
    </span>
  );
}
