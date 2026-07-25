"use client";

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
  const skin = `hsl(${hue} 35% 82%)`;
  const shirt = `hsl(${hue} 45% 45%)`;
  const hair = `hsl(${(hue + 40) % 360} 30% 28%)`;

  return (
    <div
      className={`flex flex-col items-center ${compact ? "scale-90" : ""} ${
        busy ? "office-bob" : ""
      }`}
      title={`${name} · ${role}`}
    >
      <div className="relative">
        {/* body */}
        <div
          className="mx-auto h-7 w-8 rounded-t-xl rounded-b-md border-2 border-[rgba(28,42,36,0.25)]"
          style={{ background: shirt }}
        />
        {/* head */}
        <div
          className="absolute -top-5 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-[rgba(28,42,36,0.25)]"
          style={{ background: skin }}
        >
          <div
            className="absolute -top-1 left-0.5 right-0.5 h-2.5 rounded-t-full"
            style={{ background: hair }}
          />
          <div className="absolute bottom-1.5 left-1.5 h-1 w-1 rounded-full bg-[rgba(28,42,36,0.55)]" />
          <div className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-[rgba(28,42,36,0.55)]" />
          <div className="absolute bottom-0.5 left-1/2 h-0.5 w-2 -translate-x-1/2 rounded-full bg-[rgba(28,42,36,0.35)]" />
        </div>
        {busy && (
          <span className="office-doc-float absolute -right-3 -top-3 text-[10px]">📄</span>
        )}
      </div>
      <p className="mt-1 max-w-[4.5rem] truncate text-center text-[10px] font-medium leading-tight">
        {name}
      </p>
      <p className="max-w-[4.5rem] truncate text-center text-[9px] text-[var(--ink-soft)]">
        {role}
      </p>
    </div>
  );
}
