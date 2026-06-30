export type CredEnv = "Live" | "Staging";

export type Credential = {
  id: string;
  name: string; // company member the credential is granted to
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
