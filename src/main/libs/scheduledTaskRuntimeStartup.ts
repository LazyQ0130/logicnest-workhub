export const ScheduledTaskStartupStage = {
  Service: 'service',
  TaskMigration: 'task-migration',
  RunMigration: 'run-migration',
  AnnounceMigration: 'announce-migration',
} as const;

export type ScheduledTaskStartupStage =
  typeof ScheduledTaskStartupStage[keyof typeof ScheduledTaskStartupStage];

interface CronJobServiceLike {
  startPolling: () => void;
}

interface ScheduledTaskRuntimeStartupDeps<TCronJobService extends CronJobServiceLike> {
  isRuntimeAvailable: () => boolean;
  getCronJobService: () => TCronJobService;
  migrateTasks: (cronJobService: TCronJobService) => Promise<unknown>;
  migrateRuns: () => Promise<unknown>;
  migrateAnnounceJobs: () => Promise<unknown>;
  onSkipped?: () => void;
  onError?: (stage: ScheduledTaskStartupStage, error: unknown) => void;
}

export async function startScheduledTaskRuntime<TCronJobService extends CronJobServiceLike>(
  deps: ScheduledTaskRuntimeStartupDeps<TCronJobService>,
): Promise<boolean> {
  if (!deps.isRuntimeAvailable()) {
    deps.onSkipped?.();
    return false;
  }

  let cronJobService: TCronJobService;
  try {
    cronJobService = deps.getCronJobService();
    cronJobService.startPolling();
  } catch (error) {
    deps.onError?.(ScheduledTaskStartupStage.Service, error);
    return false;
  }

  const migrations: Array<{
    stage: ScheduledTaskStartupStage;
    run: () => Promise<unknown>;
  }> = [
    {
      stage: ScheduledTaskStartupStage.TaskMigration,
      run: () => deps.migrateTasks(cronJobService),
    },
    {
      stage: ScheduledTaskStartupStage.RunMigration,
      run: deps.migrateRuns,
    },
    {
      stage: ScheduledTaskStartupStage.AnnounceMigration,
      run: deps.migrateAnnounceJobs,
    },
  ];

  for (const migration of migrations) {
    try {
      await migration.run();
    } catch (error) {
      deps.onError?.(migration.stage, error);
    }
  }

  return true;
}
