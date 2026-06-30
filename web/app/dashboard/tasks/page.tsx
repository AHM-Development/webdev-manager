import { Suspense } from "react";

import { TasksView } from "@/components/tasks/tasks-view";

const TasksPage = () => {
  return (
    // h-full so the Kanban board can fill the dashboard's scroll area.
    <div className="h-full">
      <Suspense
        fallback={<div className="text-sm text-gray-500">Loading board…</div>}
      >
        <TasksView />
      </Suspense>
    </div>
  );
};

export default TasksPage;
