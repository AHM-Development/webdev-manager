"use client";

import {
  Input,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Project } from "@/components/projects/data";

export function ProjectSwitcher({
  state,
  projects,
  counts,
  currentId,
  recents,
  onSelect,
}: {
  state: ReturnType<typeof useOverlayState>;
  projects: Project[];
  counts: Record<string, number>;
  currentId: string;
  recents: string[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const q = query.trim().toLowerCase();

  const recentProjects = useMemo(
    () =>
      q
        ? []
        : (recents
            .map((id) => projects.find((p) => p.id === id))
            .filter(Boolean) as Project[]),
    [q, recents, projects]
  );

  const others = useMemo(
    () => (q ? [] : projects.filter((p) => !recents.includes(p.id))),
    [q, projects, recents]
  );

  const filtered = useMemo(
    () =>
      q ? projects.filter((p) => p.clientName.toLowerCase().includes(q)) : [],
    [q, projects]
  );

  // Flat list used for keyboard navigation (matches render order).
  const visible = q ? filtered : [...recentProjects, ...others];

  // Keep the highlighted item in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery("");
    state.close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(visible.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = visible[activeIndex];
      if (target) handleSelect(target.id);
    }
  };

  const renderItem = (p: Project, idx: number) => {
    const isActive = idx === activeIndex;
    const isCurrent = p.id === currentId;
    return (
      <li key={p.id}>
        <button
          type="button"
          ref={isActive ? activeRef : null}
          onClick={() => handleSelect(p.id)}
          onMouseEnter={() => setActiveIndex(idx)}
          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
            isActive ? "bg-gray-100 text-gray-900" : "text-gray-700"
          }`}
        >
          <span className="flex items-center gap-2">
            {isCurrent ? (
              <Check className="h-4 w-4 text-blue-600" />
            ) : (
              <span className="h-4 w-4" />
            )}
            {p.clientName}
          </span>
          <span className="text-xs text-gray-400">
            {counts[p.id] ?? 0} tasks
          </span>
        </button>
      </li>
    );
  };

  return (
    <Modal
      isOpen={state.isOpen}
      onOpenChange={(open) => {
        if (open) setActiveIndex(0);
        state.setOpen(open);
      }}
    >
      <ModalBackdrop>
        <ModalContainer placement="top" size="md">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading className="text-base font-semibold">
                Switch project
              </ModalHeading>
            </ModalHeader>

            <ModalBody className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <TextField
                  aria-label="Search projects"
                  value={query}
                  onChange={handleQueryChange}
                  autoFocus
                >
                  <Input
                    placeholder="Search clients…  (↑↓ to navigate, ↵ to select)"
                    className="w-full pl-9"
                    onKeyDown={onKeyDown}
                  />
                </TextField>
              </div>

              <div className="max-h-80 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => handleSelect("all")}
                  className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  <span className="flex items-center gap-2">
                    {!currentId || currentId === "all" ? (
                      <Check className="h-4 w-4 text-blue-600" />
                    ) : (
                      <span className="h-4 w-4" />
                    )}
                    All clients
                  </span>
                  <span className="text-xs text-gray-400">everyone</span>
                </button>

                {visible.length === 0 && q && (
                  <p className="py-6 text-center text-sm text-gray-400">
                    No clients found.
                  </p>
                )}

                {q ? (
                  <ul className="space-y-1">
                    {filtered.map((p, i) => renderItem(p, i))}
                  </ul>
                ) : (
                  <>
                    {recentProjects.length > 0 && (
                      <div className="mb-2">
                        <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                          Recent
                        </p>
                        <ul className="space-y-1">
                          {recentProjects.map((p, i) => renderItem(p, i))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                        All projects
                      </p>
                      <ul className="space-y-1">
                        {others.map((p, j) =>
                          renderItem(p, recentProjects.length + j)
                        )}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
