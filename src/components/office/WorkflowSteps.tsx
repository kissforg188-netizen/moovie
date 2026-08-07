"use client";

import type { Department, OfficeTask, WorkflowStep } from "@/lib/office/types";
import { STATUS_LABELS } from "@/lib/office/mock-data";

export function WorkflowSteps({
  department,
  tasks,
  selectedStepId,
  onSelectStep,
  onSelectTask,
}: {
  department: Department;
  tasks: OfficeTask[];
  selectedStepId: string | null;
  onSelectStep: (step: WorkflowStep) => void;
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <div className="surface flex h-full flex-col rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          {department.icon}
        </span>
        <div>
          <h2 className="text-base font-semibold text-[var(--sage-deep)]">
            Workflow · {department.name}
          </h2>
          <p className="text-xs text-[var(--ink-soft)]">
            คลิกแต่ละขั้นเพื่อดูรายละเอียดงาน
          </p>
        </div>
      </div>

      <ol className="relative flex-1 space-y-3 overflow-auto pr-1">
        <div className="absolute bottom-2 left-[1.15rem] top-2 w-0.5 bg-[var(--line)]" />
        {department.steps.map((step, index) => {
          const stepTasks = tasks.filter((t) => t.stepId === step.id);
          const active = selectedStepId === step.id;
          return (
            <li key={step.id} className="relative pl-10">
              <div
                className={`w-full rounded-xl border px-3 py-2.5 transition ${
                  active
                    ? "border-[var(--sage)] bg-[var(--mist)] shadow-sm"
                    : "border-[var(--line)] bg-white/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectStep(step)}
                  className="w-full text-left"
                >
                  <span
                    className={`absolute left-0 top-2 flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                      active
                        ? "border-[var(--sage-deep)] bg-[var(--sage)] text-white"
                        : "border-white bg-[#e7f0ea] text-[var(--sage-deep)]"
                    }`}
                  >
                    {step.order}
                  </span>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                        {step.ownerRole} · ~{step.typicalHours} ชม.
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[var(--ink-soft)]">
                      {stepTasks.length} งาน
                    </span>
                  </div>
                </button>

                {stepTasks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {stepTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onSelectTask(task.id)}
                        className={`office-card-drift inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-1.5 py-1 text-left text-[10px] ${STATUS_LABELS[task.status].tone}`}
                        style={{ animationDelay: `${index * 0.2}s` }}
                      >
                        📄 {task.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
