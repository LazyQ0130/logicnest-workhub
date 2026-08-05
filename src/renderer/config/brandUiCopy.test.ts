import { describe, expect, test } from 'vitest';

import { BRAND_UI_COPY } from './brandUiCopy';

describe('brand UI copy', () => {
  test('keeps the Chinese and English product vocabulary aligned', () => {
    expect(BRAND_UI_COPY.zh).toMatchObject({
      workHub: '工作中枢',
      defaultAgentDisplayName: '工作中枢',
      newChat: '新建任务',
      taskHistory: '任务记录',
      scheduledTasks: '自动任务',
      myAgents: '专属助手',
      skills: '能力库',
      kits: '方案库',
      mcpServers: '连接中心',
      coworkAgentEngine: '运行引擎',
    });
    expect(BRAND_UI_COPY.en).toMatchObject({
      workHub: 'Work Hub',
      defaultAgentDisplayName: 'Work Hub',
      newChat: 'New Task',
      taskHistory: 'Task History',
      scheduledTasks: 'Automations',
      myAgents: 'Personal Assistants',
      skills: 'Capability Library',
      kits: 'Solution Library',
      mcpServers: 'Connection Center',
      coworkAgentEngine: 'Runtime Engine',
    });
    expect(Object.keys(BRAND_UI_COPY.zh).sort()).toEqual(
      Object.keys(BRAND_UI_COPY.en).sort(),
    );
  });
});
