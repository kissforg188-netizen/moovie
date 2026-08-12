"use client";

import { useMemo, useState } from "react";
import {
  DEPARTMENTS,
  STATUS_LABELS,
  TASKS,
  getDepartment,
  summarizeTasks,
} from "@/lib/office/mock-data";
import type {
  DepartmentId,
  StatusFilter,
  WorkflowStep,
} from "@/lib/office/types";
import { OfficeFloor } from "./OfficeFloor";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { WorkflowSteps } from "./WorkflowSteps";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "in_progress", label: "กำลังทำ" },
  { id: "waiting_approval", label: "รออนุมัติ" },
  { id: "done", label: "เสร็จแล้ว" },
  { id: "backlog", label: "งานค้าง" },
];

export function OfficeDashboard() {
  const [deptId, setDeptId] = useState<DepartmentId>("marketing");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const department = getDepartment(deptId);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TASKS.filter((task) => {
      if (task.departmentId !== deptId) return false;
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        task.title,
        task.description,
        ...task.tags,
        STATUS_LABELS[task.status].label,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [deptId, statusFilter, query]);

  const allDeptTasks = useMemo(
    () => TASKS.filter((t) => t.departmentId === deptId),
    [deptId],
  );
  const summary = summarizeTasks(allDeptTasks);

  const selectedTask =
    TASKS.find((t) => t.id === selectedTaskId) ??
    filteredTasks.find((t) => t.id === selectedTaskId) ??
    null;

  const selectedStep: WorkflowStep | null =
    department.steps.find((s) => s.id === selectedStepId) ??
    (selectedTask
      ? department.steps.find((s) => s.id === selectedTask.stepId) ?? null
      : null);

  function selectDept(id: string) {
    setDeptId(id as DepartmentId);
    setSelectedStepId(null);
    setSelectedTaskId(null);
  }

  function selectStep(step: WorkflowStep) {
    setSelectedStepId(step.id);
    const first = filteredTasks.find((t) => t.stepId === step.id);
    setSelectedTaskId(first?.id ?? null);
  }

  function selectTask(id: string) {
    setSelectedTaskId(id);
    const task = TASKS.find((t) => t.id === id);
    if (task) {
      setDeptId(task.departmentId);
      setSelectedStepId(task.stepId);
    }
  }

  return (
    <div className="space-y-4">
      {/* header toolbar */}
      <section className="surface rounded-2xl p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs tracking-wide text-[var(--ink-soft)]">
              Office Workflow · ทดลองเล่นได้ทันที
            </p>
            <h1 className="brand-mark text-3xl text-[var(--sage-deep)] md:text-4xl">
              แผนผังออฟฟิศการ์ตูน
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--ink-soft)]">
              เลือกแผนก ดูหุ่นยนต์ flat design และเอกสารเคลื่อนตามขั้นตอน คลิกงานเพื่อดูรายละเอียด
            </p>
          </div>
          <label className="block w-full md:max-w-xs">
            <span className="text-xs text-[var(--ink-soft)]">ค้นหางาน</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ชื่องาน, แท็ก, สถานะ..."
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white/90 px-3 py-2 text-sm outline-none focus:border-[var(--sage)]"
            />
          </label>
        </div>

        {/* department menu */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {DEPARTMENTS.map((dept) => {
            const active = dept.id === deptId;
            const count = TASKS.filter((t) => t.departmentId === dept.id).length;
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => selectDept(dept.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  active
                    ? "border-transparent text-white shadow-sm"
                    : "border-[var(--line)] bg-white/80 hover:bg-white"
                }`}
                style={active ? { background: dept.color } : undefined}
              >
                <span aria-hidden>{dept.icon}</span>
                <span>{dept.name}</span>
                <span
                  className={`rounded-full px-1.5 text-[10px] ${
                    active ? "bg-white/25" : "bg-[var(--mist)] text-[var(--ink-soft)]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* status filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                statusFilter === f.id
                  ? "bg-[var(--sage-deep)] text-white"
                  : "bg-[var(--mist)] text-[var(--ink-soft)] hover:bg-[#e2ebe5]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* summary cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "งานวันนี้", value: summary.todayCount, hint: "ไม่นับงานค้าง" },
          { label: "งานค้าง", value: summary.backlog, hint: "ยังไม่เริ่ม" },
          { label: "รออนุมัติ", value: summary.waiting, hint: "ติดคอขวด" },
          {
            label: "เวลาเฉลี่ย",
            value: `${summary.avgHours} ชม.`,
            hint: "งานที่กำลังเดิน",
          },
        ].map((card, i) => (
          <div
            key={card.label}
            className="surface fade-up rounded-2xl p-4"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <p className="text-xs text-[var(--ink-soft)]">{card.label}</p>
            <p className="brand-mark mt-1 text-3xl text-[var(--sage-deep)]">
              {card.value}
            </p>
            <p className="text-[10px] text-[var(--ink-soft)]">{card.hint}</p>
          </div>
        ))}
      </section>

      {/* main workspace */}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <OfficeFloor
            departments={DEPARTMENTS}
            activeDeptId={deptId}
            tasks={filteredTasks}
            onSelectDept={selectDept}
            onSelectTask={selectTask}
            selectedTaskId={selectedTaskId}
          />

          {/* task list for current filters */}
          <div className="surface rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--sage-deep)]">
                งานในแผนก ({filteredTasks.length})
              </h2>
              <span className="text-[10px] text-[var(--ink-soft)]">
                เอกสารเคลื่อนตามสถานะแบบ mock
              </span>
            </div>
            {filteredTasks.length === 0 ? (
              <p className="rounded-xl bg-[var(--mist)] px-3 py-4 text-sm text-[var(--ink-soft)]">
                ไม่พบงานตามตัวกรอง/คำค้น — ลองเปลี่ยนสถานะหรือแผนก
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {filteredTasks.map((task) => {
                  const step = department.steps.find((s) => s.id === task.stepId);
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => selectTask(task.id)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                          selectedTaskId === task.id
                            ? "border-[var(--sage)] bg-[var(--mist)]"
                            : "border-[var(--line)] bg-white/70 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{task.title}</p>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${STATUS_LABELS[task.status].tone}`}
                          >
                            {STATUS_LABELS[task.status].label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          ขั้น: {step?.title ?? "-"} · {task.dueLabel}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <WorkflowSteps
            department={department}
            tasks={filteredTasks}
            selectedStepId={selectedStepId}
            onSelectStep={selectStep}
            onSelectTask={selectTask}
          />
          <TaskDetailPanel
            department={department}
            task={selectedTask}
            step={selectedStep}
            onClose={() => {
              setSelectedTaskId(null);
              setSelectedStepId(null);
            }}
          />
        </div>
      </section>
    </div>
  );
}
