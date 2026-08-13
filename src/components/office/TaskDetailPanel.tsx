"use client";

import type { Department, OfficeTask, WorkflowStep } from "@/lib/office/types";
import { STATUS_LABELS, getEmployee } from "@/lib/office/mock-data";

export function TaskDetailPanel({
  department,
  task,
  step,
  onClose,
}: {
  department: Department;
  task: OfficeTask | null;
  step: WorkflowStep | null;
  onClose: () => void;
}) {
  if (!task && !step) {
    return (
      <div className="surface flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl p-6 text-center">
        <div className="office-bob text-3xl">📎</div>
        <p className="mt-2 text-sm font-medium text-[var(--sage-deep)]">
          เลือกรายการเพื่อดูรายละเอียด
        </p>
        <p className="mt-1 max-w-xs text-xs text-[var(--ink-soft)]">
          คลิกขั้น workflow หรือการ์ดงานบนแผนผังออฟฟิศ
        </p>
      </div>
    );
  }

  const emp = task
    ? getEmployee(task.departmentId, task.assigneeId)
    : null;

  return (
    <div className="surface fade-up flex h-full flex-col rounded-2xl p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-soft)]">
            รายละเอียดงาน
          </p>
          <h3 className="text-lg font-semibold text-[var(--sage-deep)]">
            {task?.title ?? step?.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--ink-soft)] hover:bg-[var(--mist)]"
        >
          ปิด
        </button>
      </div>

      {task && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-md px-2 py-0.5 text-xs ${STATUS_LABELS[task.status].tone}`}>
              {STATUS_LABELS[task.status].label}
            </span>
            <span className="rounded-md bg-[var(--mist)] px-2 py-0.5 text-xs">
              ความสำคัญ:{" "}
              {task.priority === "high"
                ? "สูง"
                : task.priority === "medium"
                  ? "กลาง"
                  : "ต่ำ"}
            </span>
            <span className="rounded-md bg-[var(--mist)] px-2 py-0.5 text-xs">
              กำหนด: {task.dueLabel}
            </span>
          </div>

          <p className="text-[var(--ink-soft)]">{task.description}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[var(--mist)] p-2">
              <p className="text-[var(--ink-soft)]">ผู้รับผิดชอบ</p>
              <p className="font-medium">
                {emp?.name ?? "-"} · {emp?.role ?? ""}
              </p>
            </div>
            <div className="rounded-xl bg-[var(--mist)] p-2">
              <p className="text-[var(--ink-soft)]">ใช้เวลาแล้ว</p>
              <p className="font-medium">{task.elapsedHours} ชม.</p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">เช็กลิสต์</p>
            <ul className="space-y-1">
              {task.checklist.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white/70 px-2 py-1.5 text-xs"
                >
                  <span>{item.done ? "✅" : "⬜"}</span>
                  <span className={item.done ? "text-[var(--ink-soft)] line-through" : ""}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-1">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[var(--ink-soft)] ring-1 ring-[var(--line)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {!task && step && (
        <div className="space-y-3 text-sm">
          <p className="text-[var(--ink-soft)]">{step.description}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[var(--mist)] p-2">
              <p className="text-[var(--ink-soft)]">ผู้รับผิดชอบขั้น</p>
              <p className="font-medium">{step.ownerRole}</p>
            </div>
            <div className="rounded-xl bg-[var(--mist)] p-2">
              <p className="text-[var(--ink-soft)]">เวลาโดยประมาณ</p>
              <p className="font-medium">{step.typicalHours} ชม.</p>
            </div>
          </div>
          <p className="text-xs text-[var(--ink-soft)]">
            แผนก{department.name} · ลำดับที่ {step.order} จาก {department.steps.length} ขั้น
          </p>
        </div>
      )}
    </div>
  );
}
