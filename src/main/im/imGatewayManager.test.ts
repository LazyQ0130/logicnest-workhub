import { describe, expect, test, vi } from 'vitest';

import { IMGatewayManager } from './imGatewayManager';

function createManager(request: (method: string) => Promise<unknown>): IMGatewayManager {
  const manager = Object.create(IMGatewayManager.prototype) as IMGatewayManager;
  Object.assign(manager, {
    getOpenClawGatewayClient: () => ({ request }),
  });
  return manager;
}

describe('IMGatewayManager OpenClaw status', () => {
  test('only reports retained channels connected when runtime is actually running', async () => {
    const now = Date.now();
    const request = vi.fn(async (method: string) => {
      expect(method).toBe('channels.status');
      return {
        channelAccounts: {
          'dingtalk-connector': [{ accountId: 'dingtalk', enabled: true, running: true, lastStartAt: now }],
          feishu: [{ accountId: 'feishu-1', enabled: true, connected: true, lastInboundAt: now - 2 }],
          qqbot: [{ accountId: 'qq-id-12', enabled: true, running: false, lastError: 'login rejected' }],
          wecom: [{ accountId: 'wecom-id', enabled: true, running: true, lastOutboundAt: now - 1 }],
          'openclaw-weixin': [{ accountId: 'wx-account', enabled: true, connected: true }],
        },
      };
    });
    const manager = createManager(request);
    const config = {
      dingtalk: {
        instances: [{
          instanceId: 'dingtalk-instance',
          instanceName: 'DingTalk',
          enabled: true,
        }],
      },
      feishu: {
        instances: [{
          instanceId: 'feishu-1-instance',
          instanceName: 'Feishu',
          enabled: true,
        }],
      },
      qq: {
        instances: [{
          instanceId: 'qq-id-123456',
          instanceName: 'QQ',
          enabled: true,
        }],
      },
      wecom: {
        instances: [{
          instanceId: 'wecom-id-instance',
          instanceName: 'WeCom',
          enabled: true,
        }],
      },
      weixin: { enabled: true, accountId: 'wx-account' },
    };
    Object.assign(manager, {
      getConfig: () => config,
      getStatus: () => ({
        dingtalk: { instances: [{ instanceId: 'dingtalk-instance', connected: false, startedAt: null, lastError: null, lastInboundAt: null, lastOutboundAt: null }] },
        feishu: { instances: [{ instanceId: 'feishu-1-instance', connected: false, startedAt: null, error: null, lastInboundAt: null, lastOutboundAt: null }] },
        qq: { instances: [{ instanceId: 'qq-id-123456', connected: false, startedAt: null, lastError: null, lastInboundAt: null, lastOutboundAt: null }] },
        wecom: { instances: [{ instanceId: 'wecom-id-instance', connected: false, startedAt: null, lastError: null, lastInboundAt: null, lastOutboundAt: null }] },
        weixin: { connected: false, accountId: 'wx-account', startedAt: null, lastError: null, lastInboundAt: null, lastOutboundAt: null },
      }),
    });

    const status = await manager.getStatusWithOpenClawRuntime();
    expect(status.dingtalk.instances[0]).toMatchObject({ connected: true, startedAt: now });
    expect(status.feishu.instances[0]).toMatchObject({ connected: true, lastInboundAt: now - 2 });
    expect(status.qq.instances[0]).toMatchObject({ connected: false, lastError: 'login rejected' });
    expect(status.wecom.instances[0]).toMatchObject({ connected: true, lastOutboundAt: now - 1 });
    expect(status.weixin).toMatchObject({ connected: true, accountId: 'wx-account' });
  });

  test('classifies a missing WeChat login provider explicitly', async () => {
    const manager = createManager(async () => {
      throw new Error('GatewayClientRequestError: web login provider is not available');
    });

    const result = await manager.weixinQrLoginStart();

    expect(result.qrDataUrl).toBeUndefined();
    expect(result.message).toMatch(/login provider|登录组件/iu);
    expect(result.message).not.toContain('web login provider is not available');
  });

  test('activates the WeChat channel runtime and retries when the login provider is absent', async () => {
    const initialRequest = vi.fn(async () => {
      throw new Error('GatewayClientRequestError: web login provider is not available');
    });
    const retryRequest = vi.fn(async () => ({
      qrDataUrl: 'https://example.test/weixin-qr',
      message: 'scan',
      sessionKey: 'weixin-session',
    }));
    const prepareWeixinLoginProvider = vi.fn(async () => {});
    const manager = createManager(initialRequest);
    let clientLookupCount = 0;
    Object.assign(manager, {
      prepareWeixinLoginProvider,
      ensureOpenClawGatewayReady: vi.fn(async () => {}),
      getOpenClawGatewayClient: () => ({
        request: clientLookupCount++ === 0 ? initialRequest : retryRequest,
      }),
    });

    const result = await manager.weixinQrLoginStart();

    expect(prepareWeixinLoginProvider).toHaveBeenCalledOnce();
    expect(retryRequest).toHaveBeenCalledWith('web.login.start', {
      force: true,
      timeoutMs: 300000,
      verbose: true,
    });
    expect(result).toMatchObject({
      qrDataUrl: 'https://example.test/weixin-qr',
      sessionKey: 'weixin-session',
    });
  });

  test('rejects retired channels before attempting to start or test them', async () => {
    const request = vi.fn(async () => ({}));
    const manager = createManager(request);

    await expect(manager.startGateway('telegram')).rejects.toThrow(/retired|停用/iu);
    await expect(manager.testGateway('nim')).rejects.toThrow(/retired|停用/iu);
    expect(request).not.toHaveBeenCalled();
  });
});
