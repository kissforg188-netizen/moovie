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
    <div className="office-floor relative w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[#d8e6dc]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(28,42,36,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(28,42,36,0.05) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="pointer-events-none absolute left-[32%] top-[8%] h-[84%] w-[3%] rounded-full bg-[#c5d5c9]" />
      <div className="pointer-events-none absolute left-[4%] top-[45%] h-[3%] w-[92%] rounded-full bg-[#c5d5c9]" />

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
                active
                  ? "z-10 border-[var(--sage-deep)] shadow-[0_8px_24px_rgba(42,77,63,0.22)]"
                  : "border-white/70 hover:border-[var(--sage)] hover:shadow-md"
              }`}
              style={{
                left: `${dept.roomX}%`,
                top: `${dept.roomY}%`,
                width: `${dept.roomW}%`,
                height: `${dept.roomH}%`,
                background: active
                  ? `linear-gradient(160deg, ${dept.color}22, #fff9)`
                  : "linear-gradient(160deg, #fff8, #f3f7f4cc)",
              }}
            >
              <div
                className="flex items-center gap-1 border-b border-black/5 px-1.5 py-1 text-[10px] font-medium md:text-xs"
                style={{ color: dept.color }}
              >
                <span aria-hidden>{dept.icon}</span>
                <span className="truncate">{dept.shortName}</span>
                <span className="ml-auto rounded-full bg-white/80 px-1.5 text-[9px] text-[var(--ink-soft)]">
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
                    52,
                    Math.max(6, ((emp.deskY - dept.roomY) / dept.roomH) * 70),
                  );
                  return (
                    <div
                      key={emp.id}
                      className="absolute"
                      style={{ left: `${left}%`, top: `${top}%` }}
                    >
                      <div className="mb-0.5 h-2 w-7 rounded-sm bg-[#c4b59a] shadow-sm" />
                      <CharacterSprite
                        name={emp.name}
                        role={emp.role}
                        hue={emp.avatarHue}
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
                      className={`office-card-drift inline-flex max-w-full items-center gap-1 truncate rounded-md border border-white/80 bg-white/90 px-1.5 py-0.5 text-[9px] shadow-sm ${
                        selectedTaskId === task.id ? "ring-2 ring-[var(--sage)]" : ""
                      }`}
                      style={{ animationDelay: `${i * 0.35}s` }}
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

        <div className="pointer-events-none absolute bottom-[2%] left-[48%] -translate-x-1/2 text-center text-[10px] text-[var(--ink-soft)]">
          <div className="text-lg">🪴</div>
          โถงกลาง
        </div>
      </div>
    </div>
  );
}
