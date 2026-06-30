export type ProjectStatus =
  | "Live"
  | "Staging"
  | "Churned"
  | "In Progress"
  | "Site Handed Over";

export type ProjectType = "One Pager" | "Full Web Dev";
export type ProjectPriority = "High" | "Medium" | "Low";
export type DomainManagement = "Client Domain" | "Cloudflare";
export type ServerLocation = "Client" | "Hetzner" | "AWS";

export type Assignee = { name: string; avatar?: string };
export type ProjectWebsiteLink = {
  id: string;
  name: string;
  url: string;
};

export type Project = {
  id: string;
  clientName: string;
  type: ProjectType;
  assignee: Assignee;
  status: ProjectStatus;
  priority: ProjectPriority;
  liveLink?: string;
  stagingLink?: string;
  websites?: ProjectWebsiteLink[];
  figmaLink?: string;
  domainManagement: DomainManagement;
  serverLocation: ServerLocation;
  createdAt?: string;
  updatedAt?: string;
};

export const PRIORITY_OPTIONS: ProjectPriority[] = ["High", "Medium", "Low"];

export const priorityColor: Record<
  ProjectPriority,
  "danger" | "warning" | "success"
> = {
  High: "danger",
  Medium: "warning",
  Low: "success",
};

/** Status → HeroUI Chip color (valid: success | warning | danger | default | accent). */
export const statusColor: Record<
  ProjectStatus,
  "success" | "warning" | "danger" | "default" | "accent"
> = {
  Live: "success",
  Staging: "warning",
  "In Progress": "accent",
  "Site Handed Over": "default",
  Churned: "danger",
};

export const projects: Project[] = [
  {
    id: "p1",
    clientName: "Acme Dental",
    type: "Full Web Dev",
    assignee: { name: "Sarah Chen" },
    status: "Live",
    priority: "High",
    liveLink: "https://acmedental.com",
    stagingLink: "https://staging.acmedental.com",
    websites: [
      { id: "main", name: "Main Website", url: "https://acmedental.com" },
      {
        id: "patient-portal",
        name: "Patient Portal",
        url: "https://patients.acmedental.com",
      },
    ],
    figmaLink: "https://figma.com/file/acme",
    domainManagement: "Cloudflare",
    serverLocation: "Hetzner",
  },
  {
    id: "p2",
    clientName: "Bright Smiles",
    type: "One Pager",
    assignee: { name: "Mike Ross" },
    status: "Staging",
    priority: "Medium",
    stagingLink: "https://staging.brightsmiles.io",
    websites: [
      { id: "one-pager", name: "One Pager", url: "https://brightsmiles.io" },
    ],
    figmaLink: "https://figma.com/file/bright",
    domainManagement: "Client Domain",
    serverLocation: "Client",
  },
  {
    id: "p3",
    clientName: "GreenLeaf Clinic",
    type: "Full Web Dev",
    assignee: { name: "Aisha Khan" },
    status: "In Progress",
    priority: "High",
    figmaLink: "https://figma.com/file/greenleaf",
    domainManagement: "Cloudflare",
    serverLocation: "AWS",
  },
  {
    id: "p4",
    clientName: "Urban Physio",
    type: "One Pager",
    assignee: { name: "Tom Baker" },
    status: "Site Handed Over",
    priority: "Low",
    liveLink: "https://urbanphysio.co.uk",
    websites: [
      {
        id: "main",
        name: "Main Website",
        url: "https://urbanphysio.co.uk",
      },
    ],
    domainManagement: "Client Domain",
    serverLocation: "Client",
  },
  {
    id: "p5",
    clientName: "NovaCare",
    type: "Full Web Dev",
    assignee: { name: "Sarah Chen" },
    status: "Churned",
    priority: "Low",
    figmaLink: "https://figma.com/file/novacare",
    domainManagement: "Cloudflare",
    serverLocation: "Hetzner",
  },
  {
    id: "p6",
    clientName: "PeakFit Studio",
    type: "One Pager",
    assignee: { name: "Aisha Khan" },
    status: "Live",
    priority: "Medium",
    liveLink: "https://peakfit.studio",
    websites: [
      { id: "main", name: "Main Website", url: "https://peakfit.studio" },
      {
        id: "classes",
        name: "Class Schedule",
        url: "https://classes.peakfit.studio",
      },
    ],
    figmaLink: "https://figma.com/file/peakfit",
    domainManagement: "Client Domain",
    serverLocation: "AWS",
  },
  {
    id: "p7",
    clientName: "CityVet",
    type: "Full Web Dev",
    assignee: { name: "Mike Ross" },
    status: "Staging",
    priority: "High",
    stagingLink: "https://staging.cityvet.com",
    websites: [
      { id: "main", name: "Main Website", url: "https://cityvet.com" },
    ],
    figmaLink: "https://figma.com/file/cityvet",
    domainManagement: "Cloudflare",
    serverLocation: "Hetzner",
  },
];

export const TYPE_OPTIONS: ProjectType[] = ["One Pager", "Full Web Dev"];
export const STATUS_OPTIONS: ProjectStatus[] = [
  "Live",
  "Staging",
  "In Progress",
  "Site Handed Over",
  "Churned",
];
