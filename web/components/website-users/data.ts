export type CredEnv = "Live" | "Staging";

export type Credential = {
  id: string;
  name: string; // company member the credential is granted to
  userId?: string; // linked application user (undefined = custom/non-registered name)
  userName?: string | null; // linked user's current name (for display)
  // Target is either a managed project (projectId) or an external site (externalSite).
  projectId?: string;
  projectName?: string | null;
  websiteId?: string;
  websiteName?: string | null;
  websiteUrl?: string | null;
  externalSite?: string;
  environment: CredEnv;
  username: string;
  password?: string;
  createdAt: string;
  passwordUpdatedAt: string;
  note?: string;
  // Set on synthetic rows for WordPress users that exist on a connected site
  // but have no credential yet. These are read-only prompts to add one.
  unmanaged?: boolean;
  wpRole?: string;
  wpEmail?: string;
};

export const seedCredentials: Credential[] = [
  {
    id: "c1",
    name: "Sarah Chen",
    projectId: "p1",
    environment: "Live",
    username: "sarah.admin",
    password: "Acm3-L1ve!2026",
    createdAt: "2026-01-18",
    passwordUpdatedAt: "2026-05-28",
    note: "WP admin — full access",
  },
  {
    id: "c2",
    name: "Sarah Chen",
    projectId: "p1",
    environment: "Staging",
    username: "sarah.staging",
    password: "Acm3-Stg!2026",
    createdAt: "2026-02-04",
    passwordUpdatedAt: "2026-02-04",
    note: "",
  },
  {
    id: "c3",
    name: "Mike Ross",
    projectId: "p2",
    environment: "Staging",
    username: "mike.editor",
    password: "Br1ght$mile99",
    createdAt: "2025-11-20",
    passwordUpdatedAt: "2025-12-08",
    note: "Editor role only",
  },
  {
    id: "c4",
    name: "Aisha Khan",
    projectId: "p6",
    environment: "Live",
    username: "aisha.admin",
    password: "P3akF1t-2026",
    createdAt: "2026-03-12",
    passwordUpdatedAt: "2026-06-01",
    note: "Cloudflare + WP",
  },
  {
    id: "c5",
    name: "Tom Baker",
    projectId: "p4",
    environment: "Live",
    username: "tom.admin",
    password: "Urb4nPhys!o",
    createdAt: "2025-08-15",
    passwordUpdatedAt: "2025-09-10",
    note: "Client handed over — read only",
  },
  {
    id: "c6",
    name: "Sarah Chen",
    externalSite: "Mailchimp",
    environment: "Live",
    username: "sarah@alliedhealthmedia.co.uk",
    password: "Mc-2026-news!",
    createdAt: "2026-04-03",
    passwordUpdatedAt: "2026-04-03",
    note: "Shared newsletter account",
  },
];

/** Distinct member names already in use, for the create-or-select name field. */
export function namesFrom(creds: Credential[]): string[] {
  return Array.from(new Set(creds.map((c) => c.name))).sort();
}

// ---------------------------------------------------------------------------
// Demo data — shown only when the API returns no credentials, so the table can
// be previewed end-to-end (regular rows + the yellow "in WordPress · not added"
// unmanaged rows). Remove this block and its use in website-users-table.tsx
// once real data exists.
// ---------------------------------------------------------------------------
export const sampleCredentials: Credential[] = [
  {
    id: "sample-1",
    name: "Sarah Chen",
    projectId: "p1",
    projectName: "Acme Physiotherapy",
    websiteId: "w1",
    websiteName: "Live Site",
    websiteUrl: "https://acmephysio.co.uk",
    environment: "Live",
    username: "sarah@acmephysio.co.uk",
    createdAt: "2026-01-18",
    passwordUpdatedAt: "2026-06-20",
    note: "WP admin — full access",
  },
  {
    id: "sample-2",
    name: "Mike Ross",
    projectId: "p2",
    projectName: "Bright Dental",
    websiteId: "w2",
    websiteName: "Staging",
    websiteUrl: "https://staging.brightdental.co.uk",
    environment: "Staging",
    username: "mike.editor",
    createdAt: "2025-11-20",
    passwordUpdatedAt: "2026-03-04",
    note: "Editor role only",
  },
  {
    id: "sample-3",
    name: "Aisha Khan",
    projectId: "p3",
    projectName: "Peak Fitness",
    websiteId: "w3",
    websiteName: "Live Site",
    websiteUrl: "https://peakfitness.co.uk",
    environment: "Live",
    username: "aisha.admin",
    createdAt: "2025-08-15",
    passwordUpdatedAt: "2025-09-10",
    note: "Cloudflare + WP",
  },
  {
    id: "sample-4",
    name: "Sarah Chen",
    externalSite: "Mailchimp",
    environment: "Live",
    username: "sarah@alliedhealthmedia.co.uk",
    createdAt: "2026-04-03",
    passwordUpdatedAt: "2026-04-03",
    note: "Shared newsletter account",
  },
  // Unmanaged: WordPress users found in the connected site's snapshot with no
  // matching credential yet. These render yellow with an "Add" action.
  {
    id: "wp:w1:11",
    unmanaged: true,
    name: "Dr. Helen Ward",
    wpRole: "administrator",
    wpEmail: "helen@acmephysio.co.uk",
    projectId: "p1",
    projectName: "Acme Physiotherapy",
    websiteId: "w1",
    websiteName: "Live Site",
    websiteUrl: "https://acmephysio.co.uk",
    environment: "Live",
    username: "helen@acmephysio.co.uk",
    createdAt: "",
    passwordUpdatedAt: "",
  },
  {
    id: "wp:w1:12",
    unmanaged: true,
    name: "James Reed",
    wpRole: "editor",
    wpEmail: "james@acmephysio.co.uk",
    projectId: "p1",
    projectName: "Acme Physiotherapy",
    websiteId: "w1",
    websiteName: "Live Site",
    websiteUrl: "https://acmephysio.co.uk",
    environment: "Live",
    username: "james@acmephysio.co.uk",
    createdAt: "",
    passwordUpdatedAt: "",
  },
  {
    id: "wp:w2:8",
    unmanaged: true,
    name: "Priya Nair",
    wpRole: "author",
    wpEmail: "priya@brightdental.co.uk",
    projectId: "p2",
    projectName: "Bright Dental",
    websiteId: "w2",
    websiteName: "Live Site",
    websiteUrl: "https://brightdental.co.uk",
    environment: "Live",
    username: "priya@brightdental.co.uk",
    createdAt: "",
    passwordUpdatedAt: "",
  },
];
