import { expect, test } from 'vitest';

import { OpenClawProviderId, ProviderAuthType, ProviderCategory, ProviderName } from '../../../shared/providers';
import {
  buildOpenAIConnectionTestRequestBody,
  filterProviderKeysBySearch,
  findPreferredProviderForCategory,
  getDefaultProviders,
  getOpenClawProviderIdForConfig,
  getProviderKeysForCategory,
  hasEquivalentProviderModelId,
  hasProviderAuthConfigured,
  type ProviderConfig,
  providerRequiresApiKey,
  type ProvidersConfig,
  shouldShowApiFormatSelector,
} from './modelProviderUtils';

const providerConfig = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  enabled: true,
  apiKey: '',
  baseUrl: 'https://api.example.com',
  models: [],
  ...overrides,
});

test('GitHub Copilot does not require a persisted API key', () => {
  expect(providerRequiresApiKey(ProviderName.Copilot)).toBe(false);
});

test('GitHub Copilot OAuth auth is tracked by authType instead of apiKey', () => {
  expect(hasProviderAuthConfigured(
    ProviderName.Copilot,
    providerConfig({ authType: ProviderAuthType.OAuth }),
  )).toBe(true);

  expect(hasProviderAuthConfigured(
    ProviderName.Copilot,
    providerConfig({ apiKey: 'legacy-short-token' }),
  )).toBe(false);
});

test('MiniMax OAuth resolves to the OpenClaw portal provider', () => {
  expect(getOpenClawProviderIdForConfig(
    ProviderName.Minimax,
    providerConfig({ authType: ProviderAuthType.OAuth }),
  )).toBe(OpenClawProviderId.MinimaxPortal);

  expect(getOpenClawProviderIdForConfig(
    ProviderName.Minimax,
    providerConfig({ authType: ProviderAuthType.ApiKey }),
  )).toBe(OpenClawProviderId.Minimax);
});

test('OpenAI OAuth models use the canonical OpenClaw OpenAI provider id', () => {
  expect(getOpenClawProviderIdForConfig(
    ProviderName.OpenAI,
    providerConfig({ authType: ProviderAuthType.OAuth }),
  )).toBe(OpenClawProviderId.OpenAI);
});

test('provider model identity comparison ignores K3 punctuation and casing', () => {
  expect(hasEquivalentProviderModelId(
    [{ id: 'kimi-k3' }],
    ' Kimi_K3 ',
  )).toBe(true);
});

test('provider model identity comparison excludes the model currently being edited', () => {
  expect(hasEquivalentProviderModelId(
    [{ id: 'Kimi_K3' }],
    'kimi.k3',
    'Kimi_K3',
  )).toBe(false);

  expect(hasEquivalentProviderModelId(
    [{ id: 'Kimi_K3' }, { id: 'kimi.k3' }],
    'kimi-k3',
    'Kimi_K3',
  )).toBe(true);
});

test('provider model identity comparison preserves distinct non-K3 punctuation', () => {
  expect(hasEquivalentProviderModelId(
    [{ id: 'foo/bar' }, { id: 'model.v1' }],
    'foo-bar',
  )).toBe(false);
  expect(hasEquivalentProviderModelId(
    [{ id: 'foo/bar' }, { id: 'model.v1' }],
    'model-v1',
  )).toBe(false);
});

test('legacy Moonshot Anthropic configs stay visible and use their real transport', () => {
  expect(shouldShowApiFormatSelector(ProviderName.Moonshot, 'anthropic')).toBe(true);
  expect(shouldShowApiFormatSelector(ProviderName.Moonshot, 'openai')).toBe(false);
});

test('official Moonshot K3 connection test uses the K3 request contract', () => {
  expect(buildOpenAIConnectionTestRequestBody({
    provider: ProviderName.Moonshot,
    model: { id: 'kimi-k3' },
    useResponsesApi: false,
  })).toEqual({
    model: 'kimi-k3',
    messages: [{ role: 'user', content: 'Hi' }],
    max_tokens: 64,
    reasoning_effort: 'max',
  });
});

test('exact custom K3 model ID uses the K3 request contract', () => {
  expect(buildOpenAIConnectionTestRequestBody({
    provider: 'custom_0',
    model: { id: 'kimi-k3' },
    useResponsesApi: false,
  })).toMatchObject({
    model: 'kimi-k3',
    max_tokens: 64,
    reasoning_effort: 'max',
  });
});

test('ordinary OpenAI-compatible connection tests retain their existing token field', () => {
  expect(buildOpenAIConnectionTestRequestBody({
    provider: 'custom_0',
    model: { id: 'ordinary-model' },
    useResponsesApi: false,
  })).toEqual({
    model: 'ordinary-model',
    messages: [{ role: 'user', content: 'Hi' }],
    max_tokens: 64,
  });
});

test('provider categories expose built-ins and custom providers in display order', () => {
  const providers = {
    ...getDefaultProviders(),
    custom_2: providerConfig({ displayName: 'Second Custom' }),
    custom_0: providerConfig({ displayName: 'First Custom' }),
  } as ProvidersConfig;

  expect(getProviderKeysForCategory(ProviderCategory.International, providers)).toEqual([
    ProviderName.OpenAI,
    ProviderName.Gemini,
    ProviderName.Anthropic,
    ProviderName.OpenRouter,
    ProviderName.Xai,
    ProviderName.Copilot,
  ]);
  expect(getProviderKeysForCategory(ProviderCategory.Domestic, providers)).toHaveLength(10);
  expect(getProviderKeysForCategory(ProviderCategory.Local, providers)).toEqual([
    ProviderName.Ollama,
    ProviderName.LmStudio,
  ]);
  expect(getProviderKeysForCategory(ProviderCategory.Custom, providers)).toEqual([
    'custom_0',
    'custom_2',
  ]);
});

test('category selection remembers a valid provider then falls back to enabled or first', () => {
  const defaults = getDefaultProviders();
  const providers = {
    ...defaults,
    [ProviderName.OpenAI]: providerConfig(),
    [ProviderName.Gemini]: providerConfig({ apiKey: 'gemini-key' }),
    [ProviderName.Anthropic]: providerConfig(),
  } as ProvidersConfig;

  expect(findPreferredProviderForCategory(
    ProviderCategory.International,
    providers,
    ProviderName.Anthropic,
  )).toBe(ProviderName.Anthropic);
  expect(findPreferredProviderForCategory(
    ProviderCategory.International,
    providers,
  )).toBe(ProviderName.Gemini);

  const disabledProviders = {
    ...providers,
    [ProviderName.Gemini]: providerConfig({ enabled: false, apiKey: '' }),
  } as ProvidersConfig;
  expect(findPreferredProviderForCategory(
    ProviderCategory.International,
    disabledProviders,
  )).toBe(ProviderName.OpenAI);
});

test('provider search filters only the supplied category keys', () => {
  const providers = {
    ...getDefaultProviders(),
    custom_0: providerConfig({ displayName: 'Private Gateway' }),
  } as ProvidersConfig;

  const international = getProviderKeysForCategory(ProviderCategory.International, providers);
  expect(filterProviderKeysBySearch(international, providers, 'gem')).toEqual([ProviderName.Gemini]);
  expect(filterProviderKeysBySearch(international, providers, 'deepseek')).toEqual([]);
  expect(filterProviderKeysBySearch(['custom_0'], providers, 'private')).toEqual(['custom_0']);
});
