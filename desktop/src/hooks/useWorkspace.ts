import { useEffect, useRef, useState } from 'react';
import { repository } from '../db/repository';
import { emptyWorkspace, type Workspace } from '../types/state';

export type Commit = (change: (state: Workspace) => Workspace) => Promise<void>;
export function useWorkspace() {
  const [state, setState] = useState(emptyWorkspace);
  const current = useRef(state);
  const queue = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((value) => {
        if (!active) return;
        current.current = value;
        setState(value);
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        if (!active) return;
        setError(
          'Your saved data could not be loaded. Restart the app. Existing data has not been replaced.',
        );
      });
    return () => {
      active = false;
    };
  }, []);
  const commit: Commit = (change) => {
    const operation = queue.current.then(async () => {
      if (!ready) throw new Error('Storage is not ready.');
      const next = change(current.current);
      await repository.save(next);
      current.current = next;
      setState(next);
    });
    queue.current = operation.catch(() => {});
    return operation;
  };
  return { state, ready, error, commit };
}
