"use client";

import type { CSSProperties } from "react";

function neonPalette(hue: number) {
  const h = ((hue % 360) + 360) % 360;
  return {
    glow: `hsl(${h} 95% 68%)`,
    glowSoft: `hsl(${h} 95% 72% / 0.65)`,
    shirt: `hsl(${h} 90% 64%)`,
    shirtDeep: `hsl(${h} 80% 50%)`,
    hair: `hsl(${(h + 24) % 360} 95% 70%)`,
    hairShine: `hsl(${(h + 24) % 360} 100% 90%)`,
    skin: "#ffe8f2",
    blush: "#ff8ec8",
    eye: "#2b2440",
  };
}

export function CharacterSprite({
  name,
  role,
  hue,
  busy = false,
  compact = false,
}: {
  name: string;
  role: string;
  hue: number;
  busy?: boolean;
  compact?: boolean;
}) {
  const c = neonPalette(hue);

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
          transform: compact ? "scale(1)" : "scale(1.08)",
        } as CSSProperties
      }
    >
      <div className="relative h-[52px] w-[44px]">
        {/* aura */}
        <div
          className="pointer-events-none absolute left-1/2 top-3 h-10 w-10 -translate-x-1/2 rounded-full blur-md"
          style={{ background: c.glowSoft }}
        />

        {/* head (big chibi) */}
        <div
          className="absolute left-1/2 top-0 z-10 h-9 w-9 -translate-x-1/2 rounded-full border-[2.5px]"
          style={{
            background: `radial-gradient(circle at 32% 28%, #fff 0%, ${c.skin} 42%, #ffd6ea 100%)`,
            borderColor: c.glow,
            boxShadow: `0 0 14px ${c.glowSoft}, 0 0 2px ${c.glow}`,
          }}
        >
          {/* bangs */}
          <div
            className="absolute -top-0.5 left-[2px] right-[2px] h-3.5 rounded-[1rem_1rem_40%_40%] border-x-[2.5px] border-t-[2.5px]"
            style={{
              background: `linear-gradient(180deg, ${c.hairShine} 0%, ${c.hair} 70%)`,
              borderColor: c.glow,
            }}
          />
          {/* ahoge */}
          <div
            className="absolute -top-2.5 left-[14px] h-3 w-2 rotate-[-18deg] rounded-full border-2"
            style={{ background: c.hair, borderColor: c.glow }}
          />

          {/* eyes - oversized cute */}
          <div className="absolute top-[14px] left-[6px] h-[9px] w-[8px] rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.95)]">
            <div
              className="absolute bottom-[1px] left-[1px] h-[7px] w-[6px] rounded-full"
              style={{ background: c.eye }}
            >
              <span className="absolute left-[1px] top-[1px] h-[3px] w-[3px] rounded-full bg-white" />
              <span className="absolute bottom-[1px] right-[1px] h-[1.5px] w-[1.5px] rounded-full bg-white/70" />
            </div>
          </div>
          <div className="absolute top-[14px] right-[6px] h-[9px] w-[8px] rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.95)]">
            <div
              className="absolute bottom-[1px] left-[1px] h-[7px] w-[6px] rounded-full"
              style={{ background: c.eye }}
            >
              <span className="absolute left-[1px] top-[1px] h-[3px] w-[3px] rounded-full bg-white" />
              <span className="absolute bottom-[1px] right-[1px] h-[1.5px] w-[1.5px] rounded-full bg-white/70" />
            </div>
          </div>

          {/* blush neon */}
          <div
            className="absolute bottom-[9px] left-[2px] h-2 w-2.5 rounded-full opacity-90"
            style={{ background: c.blush, boxShadow: `0 0 8px ${c.blush}` }}
          />
          <div
            className="absolute bottom-[9px] right-[2px] h-2 w-2.5 rounded-full opacity-90"
            style={{ background: c.blush, boxShadow: `0 0 8px ${c.blush}` }}
          />

          {/* smile */}
          <div className="absolute bottom-[5px] left-1/2 h-[5px] w-3 -translate-x-1/2 rounded-b-full border-b-[2.5px] border-[#5b4668]" />
        </div>

        {/* body */}
        <div
          className="absolute bottom-0 left-1/2 z-[5] h-5 w-7 -translate-x-1/2 rounded-[0.9rem] border-[2.5px]"
          style={{
            background: `linear-gradient(180deg, ${c.shirt} 0%, ${c.shirtDeep} 100%)`,
            borderColor: c.glow,
            boxShadow: `0 0 12px ${c.glowSoft}`,
          }}
        >
          <div className="absolute left-1/2 top-1 h-1.5 w-2.5 -translate-x-1/2 rounded-full bg-white/40" />
        </div>

        {/* feet */}
        <div
          className="absolute bottom-0 left-[11px] h-1.5 w-2 rounded-full border"
          style={{ background: c.shirtDeep, borderColor: c.glow }}
        />
        <div
          className="absolute bottom-0 right-[11px] h-1.5 w-2 rounded-full border"
          style={{ background: c.shirtDeep, borderColor: c.glow }}
        />

        {busy && (
          <span
            className="office-doc-float absolute -right-1 top-0 z-20 text-[12px] drop-shadow-[0_0_8px_#ff8bd6]"
            aria-hidden
          >
            ✨
          </span>
        )}
      </div>

      <p
        className="mt-0.5 max-w-[4.8rem] truncate text-center text-[10px] font-semibold leading-tight"
        style={{
          color: c.glow,
          textShadow: `0 0 10px ${c.glowSoft}`,
        }}
      >
        {name}
      </p>
      <p className="max-w-[4.8rem] truncate text-center text-[9px] text-cyan-50/75">
        {role}
      </p>
    </div>
  );
}
