import { invoke, isTauri } from '@tauri-apps/api/core';
import { emptyWorkspace, stateSchema, type Workspace } from '../types/state';
import { validateMap } from '../learning/conceptloom';
import { localEndpoint } from '../ai/providers/ollama';
import { migrateState } from './migrate';
import { changesBetween } from './changes';

const previewKey = 'conceptloom-desktop-preview-v1';
export function validateWorkspace(input: unknown): Workspace {
  const state = stateSchema.parse(input);
  localEndpoint(state.settings.endpoint);
  validateMap(state.topics);
  const courses = new Set(state.courses.map((c) => c.id));
  const spaces = new Set(state.workspaces.map((w) => w.id));
  if (
    spaces.size !== state.workspaces.length ||
    !state.workspaces.some((w) => w.id === state.activeWorkspaceId && !w.archived)
  )
    throw new Error('Invalid active workspace.');
  if (state.courses.some((c) => !spaces.has(c.workspaceId))) throw new Error('Missing workspace.');
  for (const items of [state.libraries, state.sources]) {
    if (new Set(items.map((v) => v.id)).size !== items.length)
      throw new Error('Duplicate source/library ID.');
    if (items.some((v) => !spaces.has(v.workspaceId))) throw new Error('Missing workspace.');
  }
  for (const source of state.sources) {
    if (
      source.guide &&
      (source.guide.sourceId !== source.id || source.guide.workspaceId !== source.workspaceId)
    )
      throw new Error('Source guide crosses source/workspace boundaries.');
    if (source.pages.reduce((sum, p) => sum + p.text.length, 0) > 1000000)
      throw new Error('Source is too large.');
    if (
      source.libraryIds.some(
        (id) => !state.libraries.some((l) => l.id === id && l.workspaceId === source.workspaceId),
      ) ||
      source.courseIds.some(
        (id) => !state.courses.some((c) => c.id === id && c.workspaceId === source.workspaceId),
      )
    )
      throw new Error('Source context crosses workspace boundaries.');
  }
  if (courses.size !== state.courses.length) throw new Error('Duplicate course ID.');
  for (const collection of [
    state.topics,
    state.lessons,
    state.attempts,
    state.cards,
    state.reviews,
    state.messages,
    state.notes,
    state.sessions,
  ]) {
    if (new Set(collection.map((item) => item.id)).size !== collection.length)
      throw new Error('Duplicate record ID.');
    for (const record of collection) {
      if (!courses.has(record.courseId)) throw new Error('A record refers to a missing course.');
      if (
        'topicId' in record &&
        record.topicId &&
        !state.topics.some((t) => t.id === record.topicId && t.courseId === record.courseId)
      )
        throw new Error('A record refers to a missing concept.');
    }
  }
  for (const review of state.reviews)
    if (!state.cards.some((c) => c.id === review.cardId && c.courseId === review.courseId))
      throw new Error('A review refers to a missing card.');
  for (const message of state.messages) {
    if (message.topicId && message.pinnedSource)
      throw new Error('A tutor question must use either a map concept or a pinned passage.');
    if (message.savedAt && message.role !== 'assistant')
      throw new Error('Only tutor explanations can be saved.');
    if (
      message.pinnedSource &&
      message.pinnedSource.workspaceId !==
        state.courses.find((c) => c.id === message.courseId)?.workspaceId
    )
      throw new Error('Pinned source crosses workspace boundaries.');
    if (
      message.replyTo &&
      !state.messages.some(
        (m) => m.id === message.replyTo && m.courseId === message.courseId && m.role === 'user',
      )
    )
      throw new Error('A tutor reply refers to a missing question.');
  }
  return state;
}
export interface Repository {
  load(): Promise<Workspace>;
  save(state: Workspace, previous?: Workspace): Promise<void>;
  location(): Promise<string>;
}
export const repository: Repository = {
  async load() {
    const raw: unknown = isTauri()
      ? await invoke('load_workspace')
      : JSON.parse(localStorage.getItem(previewKey) ?? 'null');
    if (!raw) return emptyWorkspace();
    const migrated = validateWorkspace(migrateState(raw));
    if (!isTauri() && (raw as { version?: number }).version === 1) {
      if (!localStorage.getItem(`${previewKey}-backup`))
        localStorage.setItem(`${previewKey}-backup`, JSON.stringify(raw));
      localStorage.setItem(previewKey, JSON.stringify(migrated));
    }
    return migrated;
  },
  async save(state, previous) {
    const parsed = validateWorkspace(state);
    if (isTauri()) {
      const before = previous ?? (await this.load());
      const patch = changesBetween(before, parsed, state);
      // A new installation has no settings row yet.
      patch.settings = parsed.settings;
      await invoke('apply_changes', { patch });
    } else localStorage.setItem(previewKey, JSON.stringify(parsed));
  },
  async location() {
    return isTauri()
      ? invoke<string>('data_location')
      : 'Browser preview storage · desktop uses SQLite';
  },
};
