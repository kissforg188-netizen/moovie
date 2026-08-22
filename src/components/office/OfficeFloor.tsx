"use client";

import { CharacterSprite } from "./CharacterSprite";
import type { Department, OfficeTask } from "@/lib/office/types";
import { STATUS_LABELS } from "@/lib/office/mock-data";

export function OfficeFloor({
  departments,
  activeDeptId,
  tasks,
  onSelectDept,
  onSelectTask,
  selectedTaskId,
}: {
  departments: Department[];
  activeDeptId: string;
  tasks: OfficeTask[];
  onSelectDept: (id: string) => void;
  onSelectTask: (id: string) => void;
  selectedTaskId?: string | null;
}) {
  return (
    <div className="office-floor neon-floor relative w-full overflow-hidden rounded-2xl border border-cyan-300/30">
      {/* night sky wash */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#2a1f4d_0%,#12182b_45%,#0b1020_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-50 mix-blend-screen neon-grid" />
      {/* neon hallways */}
      <div className="pointer-events-none absolute left-[32%] top-[8%] h-[84%] w-[3%] rounded-full bg-gradient-to-b from-cyan-300/50 via-fuchsia-400/40 to-lime-300/40 blur-[1px] shadow-[0_0_18px_rgba(103,232,249,0.55)]" />
      <div className="pointer-events-none absolute left-[4%] top-[45%] h-[3%] w-[92%] rounded-full bg-gradient-to-r from-fuchsia-400/40 via-cyan-300/50 to-amber-300/40 blur-[1px] shadow-[0_0_18px_rgba(244,114,182,0.45)]" />

      <div className="relative aspect-[4/3] min-h-[320px] w-full md:aspect-[16/10]">
        {departments.map((dept) => {
          const active = dept.id === activeDeptId;
          const deptTasks = tasks.filter((t) => t.departmentId === dept.id);
          return (
            <div
              key={dept.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDept(dept.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDept(dept.id);
                }
              }}
              className={`absolute cursor-pointer overflow-hidden rounded-xl border-2 text-left transition-all duration-300 ${
                active ? "z-10 neon-room-active" : "neon-room"
              }`}
              style={{
                left: `${dept.roomX}%`,
                top: `${dept.roomY}%`,
                width: `${dept.roomW}%`,
                height: `${dept.roomH}%`,
                borderColor: active ? dept.color : `${dept.color}99`,
                boxShadow: active
                  ? `0 0 0 1px ${dept.color}, 0 0 22px ${dept.color}88, inset 0 0 24px ${dept.color}33`
                  : `0 0 12px ${dept.color}44, inset 0 0 18px rgba(255,255,255,0.04)`,
                background: active
                  ? `linear-gradient(165deg, ${dept.color}55, rgba(12,16,32,0.88) 55%)`
                  : `linear-gradient(165deg, ${dept.color}28, rgba(10,14,28,0.82) 60%)`,
              }}
            >
              <div
                className="flex items-center gap-1 border-b border-white/10 px-1.5 py-1 text-[10px] font-semibold md:text-xs"
                style={{
                  color: "#fff",
                  textShadow: `0 0 8px ${dept.color}`,
                }}
              >
                <span aria-hidden>{dept.icon}</span>
                <span className="truncate">{dept.shortName}</span>
                <span
                  className="ml-auto rounded-full px-1.5 text-[9px] text-white"
                  style={{
                    background: `${dept.color}cc`,
                    boxShadow: `0 0 8px ${dept.color}`,
                  }}
                >
                  {deptTasks.length}
                </span>
              </div>

              <div className="relative h-[calc(100%-1.5rem)] p-1">
                {dept.employees.map((emp) => {
                  const busy = deptTasks.some(
                    (t) =>
                      t.assigneeId === emp.id &&
                      (t.status === "in_progress" || t.status === "waiting_approval"),
                  );
                  const left = Math.min(
                    72,
                    Math.max(4, ((emp.deskX - dept.roomX) / dept.roomW) * 100),
                  );
                  const top = Math.min(
                    48,
                    Math.max(4, ((emp.deskY - dept.roomY) / dept.roomH) * 62),
                  );
                  return (
                    <div
                      key={emp.id}
                      className="absolute"
                      style={{ left: `${left}%`, top: `${top}%` }}
                    >
                      <div
                        className="mb-0.5 h-2 w-8 rounded-sm border border-cyan-200/40"
                        style={{
                          background:
                            "linear-gradient(90deg, #67e8f9aa, #f0abfcaa, #fde68aaa)",
                          boxShadow: "0 0 10px rgba(103,232,249,0.45)",
                        }}
                      />
                      <CharacterSprite
                        name={emp.name}
                        role={emp.role}
                        hue={emp.avatarHue}
                        robotId={emp.robotId}
                        busy={busy}
                        compact
                      />
                    </div>
                  );
                })}

                <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-1">
                  {deptTasks.slice(0, 3).map((task, i) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTask(task.id);
                      }}
                      className={`office-card-drift neon-task-chip inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[9px] text-white ${
                        selectedTaskId === task.id ? "neon-task-selected" : ""
                      }`}
                      style={{
                        animationDelay: `${i * 0.35}s`,
                        borderColor: dept.color,
                        boxShadow: `0 0 10px ${dept.color}66`,
                      }}
                    >
                      <span className="shrink-0">📄</span>
                      <span className="truncate">{task.title}</span>
                      <span
                        className={`shrink-0 rounded px-1 ${STATUS_LABELS[task.status].tone}`}
                      >
                        {STATUS_LABELS[task.status].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        <div className="pointer-events-none absolute bottom-[2%] left-[48%] -translate-x-1/2 text-center text-[10px] text-cyan-100/80">
          <div className="text-lg drop-shadow-[0_0_8px_#67e8f9]">🪴✨</div>
          <span className="tracking-wide" style={{ textShadow: "0 0 8px #67e8f9" }}>
            โถงกลางนีออน
          </span>
        </div>
      </div>
    </div>
  );
}
