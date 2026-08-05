import type { OpenClawEngineStatus } from '../../types/cowork';

export const EngineStartupPresentation = {
  Hidden: 'hidden',
  ColdStart: 'cold-start',
  Reconnecting: 'reconnecting',
} as const;

export type EngineStartupPresentation =
  typeof EngineStartupPresentation[keyof typeof EngineStartupPresentation];

interface ResolveEngineStartupPresentationOptions {
  bootstrapping: boolean;
  phase: OpenClawEngineStatus['phase'] | undefined;
  hasReachedRunning: boolean;
}

export const resolveEngineStartupPresentation = ({
  bootstrapping,
  phase,
  hasReachedRunning,
}: ResolveEngineStartupPresentationOptions): EngineStartupPresentation => {
  if (bootstrapping) {
    return EngineStartupPresentation.ColdStart;
  }
  if (phase !== 'starting') {
    return EngineStartupPresentation.Hidden;
  }
  return hasReachedRunning
    ? EngineStartupPresentation.Reconnecting
    : EngineStartupPresentation.ColdStart;
};
