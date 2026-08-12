import { BrowserWindow, ipcMain } from 'electron';

import { McpIpcChannel } from '../../../shared/mcp/constants';
import { normalizeMcpServerUrlInput } from '../../../shared/mcp/url';
import { OpenClawConfigImpact } from '../../libs/openclawConfigImpact';
import type { McpRuntime } from '../../mcp/mcpRuntime';
import type { McpServerFormData } from '../../mcp/mcpStore';
import { startQichachaMcpApiKeyLogin } from '../../mcp/qichachaMcpAuth';
import type { LicenseCatalogItem } from '../../license/licenseApiClient';

export interface McpHandlerDeps {
  getMcpRuntime: () => McpRuntime;
  syncOpenClawConfig: (options: {
    reason: string;
    restartGatewayIfRunning?: boolean;
    expectedImpact?: OpenClawConfigImpact;
  }) => Promise<{ success: boolean; changed: boolean }>;
  getCatalog: (kind: LicenseCatalogItem['kind']) => Promise<{ items: LicenseCatalogItem[]; offline: boolean }>;
}

async function syncMcpConfig(
  syncOpenClawConfig: McpHandlerDeps['syncOpenClawConfig'],
  reason: string,
): Promise<void> {
  const result = await syncOpenClawConfig({
    reason,
    expectedImpact: OpenClawConfigImpact.Restart,
  });
  if (!result.success) {
    throw new Error('OpenClaw gateway restart failed: the connection was saved but configuration sync was not completed.');
  }
}

function normalizeMcpServerInput(data: Partial<McpServerFormData>): Partial<McpServerFormData> {
  if (
    (data.transportType === 'sse' || data.transportType === 'http')
    && data.url !== undefined
  ) {
    const normalized = normalizeMcpServerUrlInput(data.url);
    if (!normalized.ok) {
      throw new Error('MCP server URL must be an absolute HTTP or HTTPS URL.');
    }
    return { ...data, url: normalized.url };
  }
  return data;
}

const QICHACHA_REGISTRY_ID = 'qichacha';

const QICHACHA_MCP_SERVERS: Array<{
  name: string;
  description: string;
  url: string;
}> = [
  {
    name: 'qcc-company',
    description: 'Qichacha company data MCP server',
    url: 'https://agent.qcc.com/mcp/company/stream',
  },
  {
    name: 'qcc-risk',
    description: 'Qichacha risk data MCP server',
    url: 'https://agent.qcc.com/mcp/risk/stream',
  },
  {
    name: 'qcc-ipr',
    description: 'Qichacha intellectual property data MCP server',
    url: 'https://agent.qcc.com/mcp/ipr/stream',
  },
  {
    name: 'qcc-operation',
    description: 'Qichacha operation data MCP server',
    url: 'https://agent.qcc.com/mcp/operation/stream',
  },
  {
    name: 'qcc-executive',
    description: 'Qichacha executive data MCP server',
    url: 'https://agent.qcc.com/mcp/executive/stream',
  },
  {
    name: 'qcc-history',
    description: 'Qichacha historical archive data MCP server',
    url: 'https://agent.qcc.com/mcp/history/stream',
  },
];

function buildQichachaServerData(
  server: typeof QICHACHA_MCP_SERVERS[number],
  apiKey: string,
): McpServerFormData {
  return {
    name: server.name,
    description: server.description,
    transportType: 'http',
    url: server.url,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    isBuiltIn: true,
    registryId: QICHACHA_REGISTRY_ID,
  };
}

export function registerMcpHandlers(deps: McpHandlerDeps): void {
  const { getMcpRuntime, syncOpenClawConfig, getCatalog } = deps;

  ipcMain.handle(McpIpcChannel.List, () => {
    try {
      const servers = getMcpRuntime().getStore().listServers();
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list MCP servers',
      };
    }
  });

  ipcMain.handle(
    McpIpcChannel.Create,
    async (
      _event,
      data: {
        name: string;
        description: string;
        transportType: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        url?: string;
        headers?: Record<string, string>;
      },
    ) => {
      try {
        const mcpRuntime = getMcpRuntime();
        const normalizedData = normalizeMcpServerInput(data as McpServerFormData) as McpServerFormData;
        const server = mcpRuntime.getStore().createServer(normalizedData);
        if (server.enabled) {
          mcpRuntime.ensureLaunchResolution(server.id, 'mcp-server-created');
        }
        const servers = mcpRuntime.getStore().listServers();
        await syncMcpConfig(syncOpenClawConfig, 'mcp-server-created');
        return { success: true, servers };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create MCP server',
        };
      }
    },
  );

  ipcMain.handle(
    McpIpcChannel.Update,
    async (
      _event,
      id: string,
      data: {
        name?: string;
        description?: string;
        transportType?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        url?: string;
        headers?: Record<string, string>;
      },
    ) => {
      try {
        const mcpRuntime = getMcpRuntime();
        const normalizedData = normalizeMcpServerInput(data as Partial<McpServerFormData>);
        const server = mcpRuntime.getStore().updateServer(id, normalizedData);
        if (server?.enabled) {
          mcpRuntime.ensureLaunchResolution(server.id, 'mcp-server-updated');
        }
        const servers = mcpRuntime.getStore().listServers();
        await syncMcpConfig(syncOpenClawConfig, 'mcp-server-updated');
        return { success: true, servers };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update MCP server',
        };
      }
    },
  );

  ipcMain.handle(McpIpcChannel.Delete, async (_event, id: string) => {
    try {
      const mcpRuntime = getMcpRuntime();
      mcpRuntime.getStore().deleteServer(id);
      const servers = mcpRuntime.getStore().listServers();
      await syncMcpConfig(syncOpenClawConfig, 'mcp-server-deleted');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete MCP server',
      };
    }
  });

  ipcMain.handle(McpIpcChannel.DeleteByRegistryId, async (_event, registryId: string) => {
    try {
      const normalizedRegistryId = registryId.trim();
      if (!normalizedRegistryId) {
        throw new Error('MCP registry id is required');
      }
      const mcpRuntime = getMcpRuntime();
      const store = mcpRuntime.getStore();
      const matchingServers = store
        .listServers()
        .filter(server => server.registryId === normalizedRegistryId);
      for (const server of matchingServers) {
        store.deleteServer(server.id);
      }
      const servers = store.listServers();
      await syncMcpConfig(syncOpenClawConfig, 'mcp-registry-deleted');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete MCP registry servers',
      };
    }
  });

  ipcMain.handle(McpIpcChannel.SetEnabled, async (_event, options: { id: string; enabled: boolean }) => {
    try {
      const mcpRuntime = getMcpRuntime();
      mcpRuntime.getStore().setEnabled(options.id, options.enabled);
      if (options.enabled) {
        mcpRuntime.ensureLaunchResolution(options.id, 'mcp-server-enabled');
      }
      const servers = mcpRuntime.getStore().listServers();
      await syncMcpConfig(syncOpenClawConfig, 'mcp-server-toggled');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update MCP server',
      };
    }
  });

  ipcMain.handle(
    McpIpcChannel.SetEnabledByRegistryId,
    async (_event, options: { registryId: string; enabled: boolean }) => {
      try {
        const normalizedRegistryId = options.registryId.trim();
        if (!normalizedRegistryId) {
          throw new Error('MCP registry id is required');
        }
        const mcpRuntime = getMcpRuntime();
        const store = mcpRuntime.getStore();
        const matchingServers = store
          .listServers()
          .filter(server => server.registryId === normalizedRegistryId);
        for (const server of matchingServers) {
          store.setEnabled(server.id, options.enabled);
          if (options.enabled) {
            mcpRuntime.ensureLaunchResolution(server.id, 'mcp-registry-enabled');
          }
        }
        const servers = store.listServers();
        await syncMcpConfig(syncOpenClawConfig, 'mcp-registry-toggled');
        return { success: true, servers };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update MCP registry servers',
        };
      }
    },
  );

  ipcMain.handle(McpIpcChannel.RetryLaunchResolution, async (_event, id: string) => {
    try {
      const mcpRuntime = getMcpRuntime();
      await mcpRuntime.getLaunchResolverManager().retry(id);
      const servers = mcpRuntime.getStore().listServers();
      await syncMcpConfig(syncOpenClawConfig, 'mcp-launch-manual-retry');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry MCP launch resolution',
      };
    }
  });

  ipcMain.handle(McpIpcChannel.ConnectQichacha, async (event) => {
    try {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const apiKey = await startQichachaMcpApiKeyLogin(ownerWindow);
      const mcpRuntime = getMcpRuntime();
      const store = mcpRuntime.getStore();
      const existingServers = store.listServers();

      for (const qichachaServer of QICHACHA_MCP_SERVERS) {
        const data = buildQichachaServerData(qichachaServer, apiKey);
        const existing = existingServers.find(server =>
          server.registryId === QICHACHA_REGISTRY_ID
          && server.name === qichachaServer.name,
        );
        if (existing) {
          store.updateServer(existing.id, data);
        } else {
          store.createServer(data);
        }
      }

      const servers = store.listServers();
      await syncMcpConfig(syncOpenClawConfig, 'qichacha-mcp-connected');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect Qichacha MCP',
      };
    }
  });

  ipcMain.handle(McpIpcChannel.FetchMarketplace, async () => {
    try {
      const catalog = await getCatalog('CONNECTOR');
      const servers = catalog.items.map((item) => {
        const server = item.metadata.server as Record<string, unknown> | undefined;
        return {
          id: item.slug,
          name: item.nameZh,
          description_zh: item.descriptionZh,
          description_en: item.descriptionEn || item.descriptionZh,
          category: item.tags[0] || 'productivity',
          transportType: typeof server?.transportType === 'string' ? server.transportType : 'stdio',
          command: typeof server?.command === 'string' ? server.command : 'npx',
          defaultArgs: Array.isArray(server?.args) ? server.args.filter((value): value is string => typeof value === 'string') : [],
          requiredEnvKeys: Array.isArray(server?.requiredEnvKeys) ? server.requiredEnvKeys.filter((value): value is string => typeof value === 'string') : [],
          registryId: item.id,
        };
      });
      const categories = [...new Set(servers.map((server) => server.category))].map((id) => ({ id, name_zh: id, name_en: id }));
      return { success: true, data: { servers, categories }, offline: catalog.offline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '连接目录暂不可用' };
    }
  });
}
