import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type NoteColor = "white" | "blue" | "green" | "yellow" | "pink";

export type Note = {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  createdAt: string;
  updatedAt: string;
};

export type NotePayload = Pick<Note, "title" | "content" | "color">;

export async function listNotes(params?: { q?: string; limit?: number }) {
  const { data } = await apiClient.get<{ notes: Note[] }>(endpoints.notes.list, { params });
  return data.notes;
}

export async function createNote(payload: NotePayload) {
  const { data } = await apiClient.post<{ note: Note }>(endpoints.notes.create, payload);
  return data.note;
}

export async function updateNote(noteId: string, payload: NotePayload) {
  const { data } = await apiClient.patch<{ note: Note }>(endpoints.notes.update(noteId), payload);
  return data.note;
}

export async function deleteNote(noteId: string) {
  await apiClient.delete(endpoints.notes.delete(noteId));
}
