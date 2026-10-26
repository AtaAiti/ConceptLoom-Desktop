import { z } from 'zod';
import type { Course, Workspace } from '../types/state';
import type {
  PinnedSource,
  SourceChunk,
  SourceCitation,
  SourceMode,
  SourceScope,
} from '../types/sources';
import type { AIProvider } from './providers/ollama';
import { systemPrompt } from './prompts/system';
import { tutorContext } from './prompts/tutor';
import {
  mapSourceChunks,
  mapTutorInstruction,
  resolveTutorTopic,
} from '../features/tutor/mapContext';
import { sourcePolicy, sourceData } from './prompts/sources';
import {
  chunkSource,
  resolveCitations,
  resolvePinnedSource,
  selectedSources,
  sourceIndex,
} from '../features/library/sourceIndex';

export async function learningContext(
  state: Workspace,
  course: Course,
  query: string,
  overview = false,
): Promise<SourceChunk[]> {
  const scope = course.sourceScope ?? { kind: 'none' };
  const sources = selectedSources(state, scope);
  let chunks = await sourceIndex.search(state, scope, query);
  // A route is an overview of selected material, not a claim that the query matched.
  if (overview && !chunks.length)
    chunks = sources.flatMap((s) => chunkSource(s).slice(0, 2)).slice(0, 6);
  if (scope.kind !== 'none' && !chunks.length && course.sourceMode !== 'mixed')
    throw new Error(
      'No matching passages in the selected sources. Select relevant material or allow general knowledge.',
    );
  return chunks;
}
export async function generateGrounded<T>(
  provider: AIProvider,
  state: Workspace,
  course: Course,
  query: string,
  instruction: string,
  schema: z.ZodType<T>,
  overview = false,
): Promise<{ result: T; citations: SourceCitation[] }> {
  const chunks = await learningContext(state, course, query, overview);
  if (!chunks.length)
    return {
      result: await provider.structured(
        [
          { role: 'system', content: systemPrompt(course) },
          { role: 'user', content: instruction },
        ],
        schema,
      ),
      citations: [],
    };
  const response = await provider.structured(
    [
      {
        role: 'system',
        content: `${systemPrompt(course)}\n${sourcePolicy(course.sourceMode ?? 'sources-only')}\nReturn {result, citationIds}. The result follows the requested schema. citationIds must list supporting chunk IDs; never cite a chunk just because it was supplied.`,
      },
      { role: 'user', content: sourceData(chunks) },
      { role: 'user', content: instruction },
    ],
    z.object({ result: schema, citationIds: z.array(z.string()).min(1).max(6) }),
  );
  return {
    result: response.result,
    citations: resolveCitations(response.citationIds, chunks, state.sources),
  };
}
export async function answerFromSources(
  provider: AIProvider,
  state: Workspace,
  course: Course,
  question: string,
  scope: SourceScope,
  mode: SourceMode,
  pinned?: PinnedSource,
  topicId?: string,
): Promise<{ content: string; citations: SourceCitation[] }> {
  const topic = topicId ? resolveTutorTopic(state, course.id, topicId) : undefined;
  const topicChunks = topicId && !pinned ? mapSourceChunks(state, course.id, topicId, scope) : [];
  // A direct reading question uses exactly the reviewed fragment, never a fresh lexical guess.
  const retrieved = pinned
    ? [resolvePinnedSource(state, pinned)]
    : await sourceIndex.search(
        state,
        scope,
        topic
          ? `${topic.title} ${topic.dependsOn.map((id) => state.topics.find((t) => t.id === id)?.title ?? '').join(' ')} ${question}`
          : question,
      );
  const chunks = [
    ...new Map([...topicChunks, ...retrieved].map((chunk) => [chunk.id, chunk])).values(),
  ].slice(0, 6);
  if (pinned) mode = 'sources-only';
  if (!chunks.length && mode === 'sources-only')
    return {
      content:
        'From your sources: No matching passages were found. Try a term used in the material, or select another source.',
      citations: [],
    };
  const result = await provider.structured(
    [
      {
        role: 'system',
        content: `${systemPrompt(course)}\n${sourcePolicy(mode)}\n${topic ? mapTutorInstruction : ''}\nReturn sourceAnswer (supported claims only, empty if none), generalAnswer (empty in sources-only mode), and citationIds. Keep answers short and finish with a retrieval question.`,
      },
      {
        role: 'user',
        content: `Learner context (data): ${pinned ? JSON.stringify({ goal: course.goal.slice(0, 1200) }) : tutorContext(state, course, topic)}`,
      },
      ...state.messages
        .filter(
          (m) =>
            m.courseId === course.id &&
            (!topicId || m.topicId === topicId) &&
            (!pinned ||
              (m.pinnedSource?.workspaceId === pinned.workspaceId &&
                m.pinnedSource.chunkId === pinned.chunkId &&
                m.pinnedSource.excerpt === pinned.excerpt)),
        )
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) })),
      { role: 'user', content: sourceData(chunks) },
      { role: 'user', content: question },
    ],
    z.object({
      sourceAnswer: z.string().max(9000),
      generalAnswer: z.string().max(9000),
      citationIds: z.array(z.string()).max(6),
    }),
  );
  const citations = resolveCitations(result.citationIds, chunks, state.sources);
  if (result.sourceAnswer && !citations.length)
    throw new Error('The model did not support its answer with a source. Retry.');
  return {
    content:
      [
        result.sourceAnswer && `From your sources\n${result.sourceAnswer}`,
        mode === 'mixed' &&
          result.generalAnswer &&
          `General model knowledge\n${result.generalAnswer}`,
      ]
        .filter(Boolean)
        .join('\n\n') || 'There is not enough evidence in the selected sources.',
    citations,
  };
}
