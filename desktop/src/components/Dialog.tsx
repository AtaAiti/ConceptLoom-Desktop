import { useEffect, useRef, useState, type ReactNode } from 'react';

let openDialogs = 0;
let previousOverflow = '';

/** Native modal semantics provide focus containment, inert background and nested dialogs. */
export function Dialog({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const report = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener('conceptloom:error', report);
    return () => window.removeEventListener('conceptloom:error', report);
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    dialog.showModal();
    return () => {
      dialog.close();
      if (--openDialogs === 0) document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal-backdrop"
      aria-label={label}
      onKeyDown={(event) => {
        const dialog = ref.current!;
        if (event.key !== 'Tab' || (event.target as HTMLElement).closest('dialog') !== dialog)
          return;
        const items = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
          ),
        ).filter((item) => item.closest('dialog') === dialog && item.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {error && (
        <p className="notice dialog-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
