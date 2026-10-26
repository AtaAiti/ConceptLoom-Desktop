import { useRef, useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { Commit } from '../../hooks/useWorkspace';
import { errorMessage } from '../../components/ui';
import { setExplanationSaved, type TutorMessage } from './savedExplanations';

export function SaveExplanationButton({
  message,
  workspaceId,
  commit,
}: {
  message: TutorMessage;
  workspaceId: string;
  commit: Commit;
}) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  if (message.role !== 'assistant') return null;
  const saved = !!message.savedAt;
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await commit((state) =>
        setExplanationSaved(
          state,
          { workspaceId, courseId: message.courseId, messageId: message.id },
          !saved,
        ),
      );
      setStatus(
        saved ? 'Закладка убрана. Ответ остался в переписке.' : 'Добавлено в Учебный центр.',
      );
    } catch (e) {
      setError(`Не удалось изменить закладку. ${errorMessage(e)} Повторите действие.`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <div className="explanation-bookmark">
      <button
        type="button"
        className="text-button"
        aria-pressed={saved}
        disabled={busy}
        onClick={save}
      >
        <Icon size={16} aria-hidden="true" />
        {busy ? 'Сохраняем…' : saved ? 'Убрать из сохранённых' : 'Сохранить объяснение'}
      </button>
      {status && (
        <span className="muted small" role="status">
          {status}
        </span>
      )}
      {error && (
        <p className="small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
