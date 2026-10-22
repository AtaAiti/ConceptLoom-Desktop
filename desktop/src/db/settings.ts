import type { Workspace } from '../types/state';

type Settings = Workspace['settings'];
/** Preserve settings changed outside the form while its draft was open. */
export function mergeSettings(current: Settings, baseline: Settings, draft: Settings): Settings {
  return {
    ...current,
    ...Object.fromEntries(
      (Object.keys(draft) as (keyof Settings)[])
        .filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(baseline[key]))
        .map((key) => [key, draft[key]]),
    ),
  };
}
