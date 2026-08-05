export type DepartmentId =
  | "sales"
  | "marketing"
  | "accounting"
  | "warehouse"
  | "procurement"
  | "support"
  | "exec";

export type TaskStatus = "in_progress" | "waiting_approval" | "done" | "backlog";

export type RobotId =
  | "silver-knight"
  | "lavender-v"
  | "orange-crab"
  | "green-tank"
  | "purple-astro"
  | "blue-mechanic"
  | "red-tripod"
  | "yellow-worker"
  | "maroon-leader";

export interface Employee {
  id: string;
  name: string;
  role: string;
  avatarHue: number;
  robotId: RobotId;
  deskX: number; // 0-100 on floor plan
  deskY: number;
}

export interface WorkflowStep {
  id: string;
  order: number;
  title: string;
  description: string;
  ownerRole: string;
  typicalHours: number;
}

export interface OfficeTask {
  id: string;
  title: string;
  description: string;
  departmentId: DepartmentId;
  stepId: string;
  status: TaskStatus;
  assigneeId: string;
  priority: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
  dueLabel: string;
  tags: string[];
  elapsedHours: number;
  checklist: { label: string; done: boolean }[];
}

export interface Department {
  id: DepartmentId;
  name: string;
  shortName: string;
  color: string;
  roomX: number;
  roomY: number;
  roomW: number;
  roomH: number;
  icon: string;
  employees: Employee[];
  steps: WorkflowStep[];
}

export type StatusFilter = TaskStatus | "all";
