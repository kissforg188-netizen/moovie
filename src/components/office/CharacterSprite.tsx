"use client";

import type { CSSProperties } from "react";

function neonPalette(hue: number) {
  const h = ((hue % 360) + 360) % 360;
  return {
    glow: `hsl(${h} 95% 65%)`,
    glowSoft: `hsl(${h} 90% 70% / 0.55)`,
    shirt: `hsl(${h} 85% 62%)`,
    shirtDeep: `hsl(${h} 75% 48%)`,
    hair: `hsl(${(h + 28) % 360} 90% 68%)`,
    hairShine: `hsl(${(h + 28) % 360} 100% 88%)`,
    skin: `hsl(${(h + 18) % 360} 55% 90%)`,
    blush: `hsl(${(h + 330) % 360} 90% 72%)`,
    eye: `hsl(${(h + 200) % 360} 40% 28%)`,
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
      className={`neon-chibi flex flex-col items-center ${compact ? "scale-[0.92]" : ""} ${
        busy ? "office-bob" : "neon-idle"
      }`}
      title={`${name} · ${role}`}
    >
      <div
        className="relative"
        style={
          {
            "--neon": c.glow,
            "--neon-soft": c.glowSoft,
          } as CSSProperties
        }
      >
        {/* aura */}
        <div
          className="pointer-events-none absolute -inset-2 rounded-full blur-md"
          style={{ background: c.glowSoft }}
        />

        {/* body */}
        <div
          className="relative mx-auto h-8 w-9 rounded-[1.1rem] border-[2.5px]"
          style={{
            background: `linear-gradient(180deg, ${c.shirt} 0%, ${c.shirtDeep} 100%)`,
            borderColor: c.glow,
            boxShadow: `0 0 10px ${c.glowSoft}, inset 0 -3px 0 rgba(0,0,0,0.12)`,
          }}
        >
          {/* belly highlight */}
          <div className="absolute left-1/2 top-1.5 h-2 w-3 -translate-x-1/2 rounded-full bg-white/35" />
          {/* tiny arms */}
          <div
            className="absolute -left-1.5 top-2 h-2.5 w-2 rounded-full border-2"
            style={{ background: c.skin, borderColor: c.glow }}
          />
          <div
            className="absolute -right-1.5 top-2 h-2.5 w-2 rounded-full border-2"
            style={{ background: c.skin, borderColor: c.glow }}
          />
        </div>

        {/* head */}
        <div
          className="absolute -top-6 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full border-[2.5px]"
          style={{
            background: `radial-gradient(circle at 35% 30%, #fff 0%, ${c.skin} 45%, ${c.skin} 100%)`,
            borderColor: c.glow,
            boxShadow: `0 0 12px ${c.glowSoft}`,
          }}
        >
          {/* hair bangs */}
          <div
            className="absolute -top-1 left-[3px] right-[3px] h-3.5 rounded-t-full border-x-[2.5px] border-t-[2.5px]"
            style={{
              background: `linear-gradient(180deg, ${c.hairShine}, ${c.hair})`,
              borderColor: c.glow,
            }}
          />
          {/* hair tuft */}
          <div
            className="absolute -top-2.5 left-1/2 h-2.5 w-2 -translate-x-1/2 rounded-full border-2"
            style={{ background: c.hair, borderColor: c.glow }}
          />

          {/* eyes */}
          <div className="absolute bottom-[11px] left-[7px] h-[7px] w-[6px] rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]">
            <div
              className="absolute bottom-[1px] left-[1px] h-[5px] w-[4px] rounded-full"
              style={{ background: c.eye }}
            >
              <div className="absolute left-[1px] top-[1px] h-[2px] w-[2px] rounded-full bg-white" />
            </div>
          </div>
          <div className="absolute bottom-[11px] right-[7px] h-[7px] w-[6px] rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]">
            <div
              className="absolute bottom-[1px] left-[1px] h-[5px] w-[4px] rounded-full"
              style={{ background: c.eye }}
            >
              <div className="absolute left-[1px] top-[1px] h-[2px] w-[2px] rounded-full bg-white" />
            </div>
          </div>

          {/* blush */}
          <div
            className="absolute bottom-[8px] left-[3px] h-1.5 w-2 rounded-full opacity-80"
            style={{ background: c.blush, boxShadow: `0 0 6px ${c.blush}` }}
          />
          <div
            className="absolute bottom-[8px] right-[3px] h-1.5 w-2 rounded-full opacity-80"
            style={{ background: c.blush, boxShadow: `0 0 6px ${c.blush}` }}
          />

          {/* smile */}
          <div className="absolute bottom-[5px] left-1/2 h-1.5 w-2.5 -translate-x-1/2 rounded-b-full border-b-2 border-[rgba(40,30,50,0.45)]" />
        </div>

        {busy && (
          <span
            className="office-doc-float absolute -right-3 -top-4 text-[11px] drop-shadow-[0_0_6px_#ff8bd6]"
            aria-hidden
          >
            ✨📄
          </span>
        )}
      </div>

      <p
        className="mt-1.5 max-w-[4.8rem] truncate text-center text-[10px] font-semibold leading-tight"
        style={{
          color: c.glow,
          textShadow: `0 0 8px ${c.glowSoft}`,
        }}
      >
        {name}
      </p>
      <p className="max-w-[4.8rem] truncate text-center text-[9px] text-white/70">
        {role}
      </p>
    </div>
  );
}
