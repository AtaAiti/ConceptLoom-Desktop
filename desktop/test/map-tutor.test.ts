import { describe, expect, it, vi } from 'vitest';
import { emptyWorkspace, messageSchema } from '../src/types/state';
import { createCourse } from '../src/learning/courses';
import { defaultWorkspace } from '../src/types/sources';
import { validateWorkspace } from '../src/db/repository';
import { tutorContext } from '../src/ai/prompts/tutor';
import { answerFromSources } from '../src/ai/sourceLearning';
import { mapQuestion, mapSourceChunks, resolveTutorTopic } from '../src/features/tutor/mapContext';
import { restoreTutorDraft } from '../src/features/tutor/draft';
import { frontier, topicStatus } from '../src/learning/conceptloom';

const date = '2026-10-25T10:00:00.000Z';
function fixture() {
  const state = emptyWorkspace();
  const course = createCourse({
    name: 'Databases',
    goal: 'Understand transactions',
    knowledge: '',
    currentLevel: 'Beginner',
    targetLevel: 'Apply',
    explanationLanguage: 'Russian',
    sourceScope: { kind: 'selected', sourceIds: ['lecture'] },
    sourceMode: 'sources-only',
  });
  state.courses = [course, { ...course, id: 'second-course', name: 'Second' }];
  state.libraries = [
    { id: 'lib', name: 'Lectures', workspaceId: state.activeWorkspaceId, createdAt: date },
  ];
  const citation = {
    sourceId: 'lecture',
    chunkId: 'lecture:0',
    title: 'Лекция.pdf',
    page: 7,
    excerpt: 'Atomicity: all operations complete or none apply. Rollback undoes a transaction.',
  };
  state.sources = [
    {
      id: 'lecture',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: citation.title,
      importedAt: date,
      type: 'pdf',
      pages: [{ page: 7, text: citation.excerpt }],
      tags: [],
    },
  ];
  state.topics = [
    {
      id: 'base',
      courseId: course.id,
      title: 'Транзакции',
      description: 'BASE_DESCRIPTION',
      dependsOn: [],
      approved: true,
    },
    {
      id: 'selected',
      courseId: course.id,
      title: 'Атомарность',
      description: 'SELECTED_DESCRIPTION',
      dependsOn: ['base'],
      approved: true,
      citations: [citation],
    },
    {
      id: 'other',
      courseId: 'second-course',
      title: 'OTHER_COURSE_TOPIC',
      description: 'PRIVATE_DESCRIPTION',
      dependsOn: [],
      approved: true,
    },
  ];
  return { state, course, topic: state.topics[1], citation };
}

describe('map → tutor context', () => {
  it('uses the explicitly selected locked concept and prerequisite, not the available frontier', () => {
    const { state, course, topic } = fixture();
    expect(frontier(state, course.id)[0].id).toBe('base');
    expect(topicStatus(state, topic)).toBe('locked');
    const before = JSON.stringify(state);
    const current = resolveTutorTopic(state, course.id, topic.id);
    const context = JSON.parse(tutorContext(state, course, current));
    expect(context.currentTopic).toBe('Атомарность');
    expect(context.currentConcept).toMatchObject({
      id: 'selected',
      description: 'SELECTED_DESCRIPTION',
      prerequisites: [
        { id: 'base', title: 'Транзакции', description: 'BASE_DESCRIPTION', mastery: 0 },
      ],
    });
    expect(JSON.stringify(context)).not.toContain('PRIVATE_DESCRIPTION');
    expect(mapQuestion(current, 'connection')).toContain('предпосылками');
    expect(mapQuestion(state.topics[0], 'connection')).toContain('с чего начать');
    expect(mapQuestion(current, 'example')).toContain('на простом примере');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('restores a failed map question with its exact topic across serialization, excluding completed/other-course questions', () => {
    const { state, course, topic } = fixture();
    state.messages = [
      messageSchema.parse({
        id: 'q',
        courseId: course.id,
        topicId: topic.id,
        role: 'user',
        content: 'Explain',
        createdAt: date,
      }),
    ];
    const restored = validateWorkspace(JSON.parse(JSON.stringify(state)));
    expect(restoreTutorDraft(restored, course.id)).toMatchObject({
      topicId: 'selected',
      retryMessageId: 'q',
      question: 'Explain',
    });
    expect(restoreTutorDraft(restored, 'second-course').topicId).toBeUndefined();
    state.messages.push({
      id: 'a',
      courseId: course.id,
      topicId: topic.id,
      role: 'assistant',
      content: 'Answer',
      replyTo: 'q',
      createdAt: date,
    });
    expect(restoreTutorDraft(state, course.id).topicId).toBeUndefined();
  });
  it('rejects a missing, foreign-course or foreign-workspace concept and contradictory pinned context', () => {
    const { state, course, citation } = fixture();
    for (const id of ['missing', 'other'])
      expect(() => resolveTutorTopic(state, course.id, id)).toThrow(/недоступно/);
    state.workspaces.push({ ...defaultWorkspace(), id: 'foreign' });
    expect(() =>
      resolveTutorTopic({ ...state, activeWorkspaceId: 'foreign' }, course.id, 'selected'),
    ).toThrow(/недоступно/);
    state.messages = [
      {
        id: 'q',
        courseId: course.id,
        topicId: 'other',
        role: 'user',
        content: 'Explain',
        createdAt: date,
      },
    ];
    expect(() => validateWorkspace(state)).toThrow(/missing concept/);
    state.messages[0].topicId = 'selected';
    state.messages[0].pinnedSource = { ...citation, workspaceId: state.activeWorkspaceId };
    expect(() => validateWorkspace(state)).toThrow(/either/);
  });
  it('uses node evidence inside existing scope even for a vague question; context/history/citations belong to that node', async () => {
    const { state, course, topic, citation } = fixture();
    state.messages = [
      {
        id: 'other-history',
        courseId: course.id,
        topicId: 'base',
        role: 'assistant',
        content: 'OTHER_NODE_PRIVATE_HISTORY',
        createdAt: date,
      },
    ];
    const structured = vi
      .fn()
      .mockResolvedValue({
        sourceAnswer: 'All or nothing.',
        generalAnswer: '',
        citationIds: [citation.chunkId],
      });
    const answer = await answerFromSources(
      { chat: vi.fn(), models: vi.fn(), structured },
      state,
      course,
      'Объясни это',
      course.sourceScope!,
      'sources-only',
      undefined,
      topic.id,
    );
    const prompt = JSON.stringify(structured.mock.calls[0][0]);
    expect(prompt).toContain('SELECTED_DESCRIPTION');
    expect(prompt).toContain('BASE_DESCRIPTION');
    expect(prompt).toContain('learning plan, not proof');
    expect(prompt).not.toContain('OTHER_NODE_PRIVATE_HISTORY');
    expect(answer.citations).toEqual([citation]);
    expect(structured).toHaveBeenCalledTimes(1);
  });
  it('never expands source permissions and returns no evidence without calling AI in sources-only mode', async () => {
    const { state, course, topic } = fixture();
    expect(mapSourceChunks(state, course.id, topic.id, { kind: 'none' })).toEqual([]);
    const provider = { chat: vi.fn(), models: vi.fn(), structured: vi.fn() };
    const answer = await answerFromSources(
      provider,
      state,
      course,
      'Explain',
      { kind: 'selected', sourceIds: [] },
      'sources-only',
      undefined,
      topic.id,
    );
    expect(answer.citations).toEqual([]);
    expect(provider.structured).not.toHaveBeenCalled();
  });
  it('rejects changed node evidence or a missing concept before inference and rejects invented citations', async () => {
    const { state, course, topic } = fixture();
    const provider = { chat: vi.fn(), models: vi.fn(), structured: vi.fn() };
    state.sources[0].pages[0].text = 'Revised';
    await expect(
      answerFromSources(
        provider,
        state,
        course,
        'Explain',
        course.sourceScope!,
        'sources-only',
        undefined,
        topic.id,
      ),
    ).rejects.toThrow(/изменился/);
    await expect(
      answerFromSources(
        provider,
        state,
        course,
        'Explain',
        course.sourceScope!,
        'mixed',
        undefined,
        'missing',
      ),
    ).rejects.toThrow(/недоступно/);
    expect(provider.structured).not.toHaveBeenCalled();
    const fresh = fixture();
    provider.structured.mockResolvedValue({
      sourceAnswer: 'Invented',
      generalAnswer: '',
      citationIds: ['not-supplied'],
    });
    await expect(
      answerFromSources(
        provider,
        fresh.state,
        fresh.course,
        'Explain',
        fresh.course.sourceScope!,
        'sources-only',
        undefined,
        fresh.topic.id,
      ),
    ).rejects.toThrow(/not given/);
  });
});
