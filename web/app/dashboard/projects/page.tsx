import { ProjectsTable } from "@/components/projects/projects-table";

const ProjectsPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage client websites, their status, and hosting.
        </p>
      </div>

      <ProjectsTable />
    </div>
  );
};

export default ProjectsPage;
