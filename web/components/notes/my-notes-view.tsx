"use client";

import {
  Button,
  Input,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextArea,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  createNote,
  deleteNote as deleteNoteApi,
  listNotes,
  updateNote,
  type Note,
} from "@/libs/api/notes";
import { notify } from "@/libs/notify";

import { noteSchema, type NoteValues } from "./schema";

type NoteColor = NoteValues["color"];

const noteColors: Record<NoteColor, string> = {
  white: "bg-white border-slate-200",
  blue: "bg-[#eef7ff] border-[#bfdefb]",
  green: "bg-[#effaf4] border-[#bce7cd]",
  yellow: "bg-[#fff8df] border-[#f1dfa3]",
  pink: "bg-[#fff0f6] border-[#f5c7dc]",
};

const colorOptions: { id: NoteColor; label: string; className: string }[] = [
  { id: "white", label: "White", className: "bg-white border-slate-300" },
  { id: "blue", label: "Blue", className: "bg-[#dff1ff] border-[#9bcaf4]" },
  { id: "green", label: "Green", className: "bg-[#def7e9] border-[#8ed7aa]" },
  { id: "yellow", label: "Yellow", className: "bg-[#fff1b8] border-[#e6cd66]" },
  { id: "pink", label: "Pink", className: "bg-[#ffe0ef] border-[#efa9ca]" },
];

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function NoteEditor({
  state,
  note,
  onSave,
}: {
  state: ReturnType<typeof useOverlayState>;
  note: Note | null;
  onSave: (values: NoteValues) => Promise<void>;
}) {
  const form = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    values: {
      title: note?.title ?? "",
      content: note?.content ?? "",
      color: note?.color ?? "white",
    },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSave(values);
    state.close();
  });

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="md">
          <ModalDialog>
            <form onSubmit={submit}>
              <ModalHeader>
                <ModalHeading className="text-base font-semibold">
                  {note ? "Edit Note" : "Add Note"}
                </ModalHeading>
              </ModalHeader>
              <ModalBody className="space-y-4">
                <Controller
                  control={form.control}
                  name="title"
                  render={({ field, fieldState }) => (
                    <TextField
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      isInvalid={!!fieldState.error}
                    >
                      <Label>Title</Label>
                      <Input className="w-full" />
                      {fieldState.error && (
                        <p className="mt-1 text-sm text-red-600">
                          {fieldState.error.message}
                        </p>
                      )}
                    </TextField>
                  )}
                />

                <Controller
                  control={form.control}
                  name="content"
                  render={({ field, fieldState }) => (
                    <TextField
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      isInvalid={!!fieldState.error}
                    >
                      <Label>Note</Label>
                      <TextArea rows={8} className="w-full resize-y" />
                      {fieldState.error && (
                        <p className="mt-1 text-sm text-red-600">
                          {fieldState.error.message}
                        </p>
                      )}
                    </TextField>
                  )}
                />

                <Controller
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <div>
                      <Label>Color</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {colorOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => field.onChange(option.id)}
                            aria-label={option.label}
                            className={`h-9 w-9 rounded-md border transition ${
                              option.className
                            } ${
                              field.value === option.id
                                ? "ring-2 ring-[#0b7de3] ring-offset-2"
                                : ""
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                />

              </ModalBody>
              <ModalFooter className="flex justify-end gap-2">
                <Button type="button" variant="tertiary" onPress={state.close}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isDisabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving..." : "Save Note"}
                </Button>
              </ModalFooter>
            </form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

export function MyNotesView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const editor = useOverlayState();

  useEffect(() => {
    let active = true;
    void listNotes({ limit: 200 })
      .then((items) => {
        if (active) setNotes(items);
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Notes could not be loaded.";
        notify.error("Unable to load notes", { description: message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(q) ||
        note.content.toLowerCase().includes(q)
    );
  }, [notes, query]);

  const openNew = () => {
    setSelected(null);
    editor.open();
  };

  const openEdit = (note: Note) => {
    setSelected(note);
    editor.open();
  };

  const saveNote = async (values: NoteValues) => {
    try {
      if (selected) {
        const saved = await updateNote(selected.id, values);
        setNotes((current) => current.map((note) => note.id === saved.id ? saved : note));
        notify.success("Note updated");
        return;
      }
      const saved = await createNote(values);
      setNotes((current) => [saved, ...current]);
      notify.success("Note created");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The note could not be saved.";
      notify.error("Unable to save note", { description: message });
      throw error;
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await deleteNoteApi(noteId);
      setNotes((current) => current.filter((note) => note.id !== noteId));
      notify.success("Note deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The note could not be deleted.";
      notify.error("Unable to delete note", { description: message });
    }
  };

  return (
    <div className="space-y-5">
      <section className="app-toolbar p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              My Notes
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Fast personal notes for reminders, client context, and work ideas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 min-w-[260px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <Button variant="primary" onPress={openNew}>
              <Plus className="h-4 w-4" />
              Add Note
            </Button>
          </div>
        </div>
      </section>

      <section className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
        {filtered.map((note) => (
          <article
            key={note.id}
            className={`mb-4 break-inside-avoid rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${noteColors[note.color]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">
                {note.title}
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`Edit ${note.title}`}
                  onPress={() => openEdit(note)}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${note.title}`}
                  onPress={() => void deleteNote(note.id)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {note.content}
            </p>

            <div className="mt-4 border-t border-black/10 pt-3 text-xs text-slate-500">
              <p>Created {formatDate(note.createdAt)}</p>
              <p className="mt-1">Updated {formatDate(note.updatedAt)}</p>
            </div>
          </article>
        ))}
      </section>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          {loading
            ? "Loading notes..."
            : query.trim()
            ? "No notes match your search."
            : "No notes yet. Add a note to get started."}
        </div>
      )}

      <NoteEditor state={editor} note={selected} onSave={saveNote} />
    </div>
  );
}
