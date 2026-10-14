import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../src-tauri/migrations/001_initial.sql', import.meta.url),
  'utf8',
);
describe('SQLite migration', () => {
  it('is idempotent and creates all learning entities', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(migration);
    db.exec(migration);
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const table of [
      'courses',
      'topics',
      'topic_dependencies',
      'lessons',
      'learning_sessions',
      'exercises',
      'exercise_attempts',
      'mistakes',
      'flashcards',
      'reviews',
      'ai_messages',
      'settings',
      'library_notes',
    ])
      expect(rows.some((r) => r.name === table)).toBe(true);
    expect(db.prepare('SELECT count(*) AS count FROM schema_migrations').get()?.count).toBe(1);
    db.close();
  });
  it('enforces foreign keys, rollback and cascade deletion', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(migration);
    db.prepare('INSERT INTO courses(id,payload) VALUES(?,?)').run('c', '{}');
    db.prepare('INSERT INTO topics(id,course_id,payload) VALUES(?,?,?)').run('t', 'c', '{}');
    expect(() =>
      db
        .prepare('INSERT INTO topics(id,course_id,payload) VALUES(?,?,?)')
        .run('bad', 'missing', '{}'),
    ).toThrow();
    db.exec('BEGIN; DELETE FROM courses; ROLLBACK;');
    expect(db.prepare('SELECT count(*) AS n FROM topics').get()?.n).toBe(1);
    db.exec('DELETE FROM courses');
    expect(db.prepare('SELECT count(*) AS n FROM topics').get()?.n).toBe(0);
    db.close();
  });
});
