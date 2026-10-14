import { invoke, isTauri } from '@tauri-apps/api/core';
import { emptyWorkspace, stateSchema, type Workspace } from '../types/state';
import { validateMap } from '../learning/conceptloom';
import { localEndpoint } from '../ai/providers/ollama';

const previewKey = 'conceptloom-desktop-preview-v1';
export function validateWorkspace(input: unknown): Workspace {
  const state = stateSchema.parse(input);
  localEndpoint(state.settings.endpoint);
  validateMap(state.topics);
  const courses = new Set(state.courses.map((c) => c.id));
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
  return state;
}
export interface Repository {
  load(): Promise<Workspace>;
  save(state: Workspace): Promise<void>;
  location(): Promise<string>;
}
export const repository: Repository = {
  async load() {
    const raw: unknown = isTauri()
      ? await invoke('load_workspace')
      : JSON.parse(localStorage.getItem(previewKey) ?? 'null');
    return raw ? validateWorkspace(raw) : emptyWorkspace();
  },
  async save(state) {
    const parsed = validateWorkspace(state);
    if (isTauri()) await invoke('save_workspace', { state: parsed });
    else localStorage.setItem(previewKey, JSON.stringify(parsed));
  },
  async location() {
    return isTauri()
      ? invoke<string>('data_location')
      : 'Browser preview storage · desktop uses SQLite';
  },
};
