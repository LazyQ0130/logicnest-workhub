import { describe, expect, test, vi } from 'vitest';

import { OpenClawApprovalController } from '../libs/agentEngine/openclawApprovalController';

describe('meetingRoom approval suppression', () => {
  test('denies exec and plugin approvals immediately without showing a permission request', async () => {
    const request = vi.fn().mockResolvedValue({});
    const emitPermissionRequest = vi.fn();
    const emitPermissionResolved = vi.fn();
    const controller = new OpenClawApprovalController({
      getGatewayClient: () => ({ request }),
      resolveSessionId: () => 'meeting-hidden-session',
      isSessionInStopCooldown: () => false,
      isManualStopSuppressed: () => false,
      sessionExists: () => true,
      isSessionActive: () => true,
      continueSession: vi.fn(),
      emitPermissionRequest,
      emitPermissionResolved,
      emitError: vi.fn(),
      getForcedDenialReason: (_sessionId, toolName) => `Meeting policy denied ${toolName}`,
    });

    controller.handleExecApprovalRequested({
      id: 'exec-request',
      request: { sessionKey: 'agent:main:meeting', command: 'Get-Content file.txt' },
    });
    controller.handlePluginApprovalRequested({
      id: 'plugin-request',
      request: { sessionKey: 'agent:main:meeting', pluginId: 'browser', allowedDecisions: ['allow-once', 'deny'] },
    });
    await Promise.resolve();

    expect(emitPermissionRequest).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1]).toMatchObject({ id: 'exec-request', decision: 'deny' });
    expect(request.mock.calls[1][1]).toMatchObject({ id: 'plugin-request', decision: 'deny' });
    expect(emitPermissionResolved).toHaveBeenCalledTimes(2);
  });
});
