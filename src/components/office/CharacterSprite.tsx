"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import type { RobotId } from "@/lib/office/types";

function neonFromHue(hue: number) {
  const h = ((hue % 360) + 360) % 360;
  return {
    glow: `hsl(${h} 95% 68%)`,
    glowSoft: `hsl(${h} 95% 72% / 0.55)`,
  };
}

export function CharacterSprite({
  name,
  role,
  hue,
  robotId,
  busy = false,
  compact = false,
}: {
  name: string;
  role: string;
  hue: number;
  robotId: RobotId;
  busy?: boolean;
  compact?: boolean;
}) {
  const c = neonFromHue(hue);
  const size = compact ? 52 : 64;

  return (
    <div
      className={`neon-chibi flex flex-col items-center ${
        busy ? "office-bob" : "neon-idle"
      }`}
      title={`${name} · ${role}`}
      style={
        {
          "--neon": c.glow,
          "--neon-soft": c.glowSoft,
        } as CSSProperties
      }
    >
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="pointer-events-none absolute inset-[-6px] rounded-full blur-md"
          style={{ background: c.glowSoft }}
        />
        <div
          className="relative overflow-hidden rounded-2xl border-2 bg-white/10"
          style={{
            width: size,
            height: size,
            borderColor: c.glow,
            boxShadow: `0 0 14px ${c.glowSoft}, inset 0 0 10px rgba(255,255,255,0.15)`,
          }}
        >
          <Image
            src={`/robots/${robotId}.png`}
            alt={name}
            width={size}
            height={size}
            className="h-full w-full object-contain p-0.5"
            priority={false}
          />
        </div>
        {busy && (
          <span
            className="office-doc-float absolute -right-1 -top-1 z-10 text-[11px] drop-shadow-[0_0_8px_#ff8bd6]"
            aria-hidden
          >
            ✨📄
          </span>
        )}
      </div>
      <p
        className="mt-1 max-w-[4.8rem] truncate text-center text-[10px] font-semibold leading-tight"
        style={{ color: c.glow, textShadow: `0 0 10px ${c.glowSoft}` }}
      >
        {name}
      </p>
      <p className="max-w-[4.8rem] truncate text-center text-[9px] text-cyan-50/75">
        {role}
      </p>
    </div>
  );
}
