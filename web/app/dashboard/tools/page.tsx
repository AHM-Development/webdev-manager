import { Button, Chip } from "@heroui/react";
import {
  Cable,
  FileUp,
  ImageIcon,
  WandSparkles,
} from "lucide-react";

const tools = [
  {
    name: "Images to WebP",
    description:
      "Convert uploaded JPG and PNG assets into optimized WebP files for faster websites.",
    status: "Ready",
    action: "Open Tool",
    href: null,
    icon: ImageIcon,
  },
  {
    name: "AHM Core",
    description:
      "Connect WordPress to AHM Webdev Manager for health scans, inventory, users, activity, and future site operations.",
    status: "Ready",
    action: "Download Plugin",
    href: "/downloads/ahm-core.zip",
    icon: Cable,
  },
  {
    name: "Content Uploader",
    description:
      "Prepare and upload page content, metadata, images, and structured blocks to connected websites.",
    status: "Planned",
    action: "Coming Soon",
    href: null,
    icon: FileUp,
  },
  {
    name: "Figma to Elementor Converter",
    description:
      "Translate Figma layouts into Elementor-ready sections for faster WordPress builds.",
    status: "Research",
    action: "Coming Soon",
    href: null,
    icon: WandSparkles,
  },
] as const;

const ToolsPage = () => {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Tools</h1>
        <p className="mt-1 text-sm text-gray-500">
          Utilities for build speed, website maintenance, and content delivery.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <div key={tool.name} className="app-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f5ff] text-[#0b7de3]">
                  <Icon className="h-5 w-5" />
                </div>
                <Chip
                  size="sm"
                  variant="soft"
                  color={tool.status === "Ready" ? "success" : "default"}
                >
                  {tool.status}
                </Chip>
              </div>
              <h2 className="mt-5 text-base font-semibold text-gray-900">
                {tool.name}
              </h2>
              <p className="mt-2 min-h-20 text-sm leading-6 text-gray-500">
                {tool.description}
              </p>
              {tool.href ? (
                <a
                  className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0b7de3] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0969bd]"
                  href={tool.href}
                  download="ahm-core.zip"
                >
                  {tool.action}
                </a>
              ) : (
                <Button className="mt-5 w-full" variant="tertiary" isDisabled>
                  {tool.action}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ToolsPage;
