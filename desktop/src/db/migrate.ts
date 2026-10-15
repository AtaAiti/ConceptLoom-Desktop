import { stateSchema, type Workspace } from '../types/state';
import { defaultWorkspace } from '../types/sources';

/** Pure, idempotent v1 → v2 migration. The old note records remain as an archive. */
export function migrateState(input: unknown): Workspace {
  if (!input || typeof input !== 'object') throw new Error('Invalid saved data.');
  const raw = input as Record<string, unknown>;
  if (raw.version === 2) return stateSchema.parse(raw);
  if (raw.version !== 1) throw new Error('Unsupported saved data version.');
  const preliminary = stateSchema.parse({
    ...raw,
    version: 2,
    workspaces: [defaultWorkspace()],
    activeWorkspaceId: 'my-learning',
    libraries: [],
    sources: [],
  });
  const libraries = preliminary.courses
    .filter((c) => preliminary.notes.some((n) => n.courseId === c.id))
    .map((c) => ({
      id: `library-${c.id}`,
      workspaceId: 'my-learning',
      name: c.name,
      createdAt: c.createdAt,
    }));
  return stateSchema.parse({
    ...preliminary,
    libraries,
    courses: preliminary.courses.map((c) => ({
      ...c,
      subjectKind: ['english', 'korean'].includes(c.targetLanguage.toLowerCase())
        ? 'language'
        : 'general',
      domain: c.targetLanguage ? { targetLanguage: c.targetLanguage } : undefined,
    })),
    sources: preliminary.notes.map((n) => ({
      id: n.id,
      workspaceId: 'my-learning',
      libraryIds: [`library-${n.courseId}`],
      courseIds: [n.courseId],
      title: n.title,
      type: 'pasted',
      importedAt: n.createdAt,
      pages: [{ page: null, text: n.content }],
      tags: ['migrated'],
    })),
  });
}
