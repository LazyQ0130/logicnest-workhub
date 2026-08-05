import { ProviderRegistry } from '../../shared/providers';
import { getServerModelMetadata } from '../libs/claudeSettings';

const normalizeModelId = (modelRef: string): string => {
  const trimmed = modelRef.trim();
  const separator = trimmed.lastIndexOf('/');
  return separator >= 0 ? trimmed.slice(separator + 1) : trimmed;
};

export const meetingModelSupportsVision = (modelRef: string): boolean => {
  const modelId = normalizeModelId(modelRef);
  if (!modelId) return false;
  return getServerModelMetadata(modelId)?.supportsImage
    ?? ProviderRegistry.getKnownModelSupportsImage(modelId)
    ?? false;
};
