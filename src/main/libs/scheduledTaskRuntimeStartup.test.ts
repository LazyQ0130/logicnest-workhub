import { describe, expect, test, vi } from 'vitest';

import {
  ScheduledTaskStartupStage,
  startScheduledTaskRuntime,
} from './scheduledTaskRuntimeStartup';

describe('startScheduledTaskRuntime', () => {
  test('skips polling and migrations when the authorized runtime is unavailable', async () => {
    const startPolling = vi.fn();
    const getCronJobService = vi.fn(() => ({ startPolling }));
    const migrateTasks = vi.fn(async () => {});
    const migrateRuns = vi.fn(async () => {});
    const migrateAnnounceJobs = vi.fn(async () => {});
    const onSkipped = vi.fn();

    await expect(startScheduledTaskRuntime({
      isRuntimeAvailable: () => false,
      getCronJobService,
      migrateTasks,
      migrateRuns,
      migrateAnnounceJobs,
      onSkipped,
    })).resolves.toBe(false);

    expect(onSkipped).toHaveBeenCalledOnce();
    expect(getCronJobService).not.toHaveBeenCalled();
    expect(startPolling).not.toHaveBeenCalled();
    expect(migrateTasks).not.toHaveBeenCalled();
    expect(migrateRuns).not.toHaveBeenCalled();
    expect(migrateAnnounceJobs).not.toHaveBeenCalled();
  });

  test('starts polling and runs every migration once when the runtime is available', async () => {
    const startPolling = vi.fn();
    const cronJobService = { startPolling };
    const migrateTasks = vi.fn(async () => {});
    const migrateRuns = vi.fn(async () => {});
    const migrateAnnounceJobs = vi.fn(async () => {});

    await expect(startScheduledTaskRuntime({
      isRuntimeAvailable: () => true,
      getCronJobService: () => cronJobService,
      migrateTasks,
      migrateRuns,
      migrateAnnounceJobs,
    })).resolves.toBe(true);

    expect(startPolling).toHaveBeenCalledOnce();
    expect(migrateTasks).toHaveBeenCalledOnce();
    expect(migrateTasks).toHaveBeenCalledWith(cronJobService);
    expect(migrateRuns).toHaveBeenCalledOnce();
    expect(migrateAnnounceJobs).toHaveBeenCalledOnce();
  });

  test('contains migration failures so fire-and-forget startup cannot reject', async () => {
    const migrationError = new Error('migration failed');
    const onError = vi.fn();

    await expect(startScheduledTaskRuntime({
      isRuntimeAvailable: () => true,
      getCronJobService: () => ({ startPolling: () => {} }),
      migrateTasks: async () => {
        throw migrationError;
      },
      migrateRuns: async () => {},
      migrateAnnounceJobs: async () => {},
      onError,
    })).resolves.toBe(true);

    expect(onError).toHaveBeenCalledWith(
      ScheduledTaskStartupStage.TaskMigration,
      migrationError,
    );
  });
});
