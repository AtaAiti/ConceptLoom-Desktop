import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DesignIcon } from './DesignIcon';

export function WindowBar({ onError }: { onError: (task: () => Promise<void>) => void }) {
  return (
    <div className="window-bar">
      <div
        className="window-drag"
        data-tauri-drag-region
        onDoubleClick={() => {
          if (isTauri()) onError(() => getCurrentWindow().toggleMaximize());
        }}
      >
        <DesignIcon name="imgLayers" /> ConceptLoom Desktop
      </div>
      {isTauri() && (
        <div className="window-actions">
          <button
            aria-label="Свернуть"
            onClick={() => onError(() => getCurrentWindow().minimize())}
          >
            <DesignIcon name="imgMinus" />
          </button>
          <button
            aria-label="Развернуть или восстановить"
            onClick={() => onError(() => getCurrentWindow().toggleMaximize())}
          >
            <DesignIcon name="imgSquare" />
          </button>
          <button
            aria-label="Закрыть окно"
            onClick={() => onError(() => getCurrentWindow().close())}
          >
            <DesignIcon name="imgX" />
          </button>
        </div>
      )}
    </div>
  );
}
