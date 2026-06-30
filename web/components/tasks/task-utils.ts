import type { Task, TaskChecklistItem } from "./data";

export function makeChecklistItem(title: string, index = 0): TaskChecklistItem {
  return {
    id: `check-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    completed: false,
  };
}

export function checklistProgress(task: Task) {
  const items = task.checklist ?? [];
  const total = items.length;
  const completed = items.filter((item) => item.completed).length;
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}
