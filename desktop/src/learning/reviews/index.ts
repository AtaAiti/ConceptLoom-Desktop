import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import type { Flashcard } from '../../types/state';

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
export { Rating };
export function newCard(
  courseId: string,
  topicId: string | null,
  front: string,
  back: string,
  now = new Date(),
): Flashcard {
  const card = createEmptyCard(now);
  return {
    ...card,
    id: crypto.randomUUID(),
    courseId,
    topicId,
    front,
    back,
    due: card.due.toISOString(),
    last_review: undefined,
  };
}
export function reviewCard(card: Flashcard, rating: Grade, now = new Date()): Flashcard {
  const input: Card = {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
  const result = scheduler.next(input, now, rating).card;
  return {
    ...card,
    ...result,
    due: result.due.toISOString(),
    last_review: result.last_review?.toISOString(),
  };
}
