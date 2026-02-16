import express from 'express';
import cron from 'node-cron';
import { authMiddleware } from './auth/rbac';
import { loadConfig, type RuntimeConfig } from './config/env';
import { createCalendarRouter, errorHandler } from './controllers/calendarController';
import { createPgClient } from './db/client';
import { SimulatedContractGateway } from './integrations/contractGateway';
import { SimulatedGoogleMeetProvider } from './integrations/googleMeet';
import { InMemoryTransactionManager } from './repositories/inMemoryRepositories';
import { PgTransactionManager } from './repositories/postgresRepositories';
import { CalendarService } from './services/calendarService';
import { CronService } from './services/cronService';
import { NotificationService } from './services/notificationService';

type AppTxManager = InMemoryTransactionManager | PgTransactionManager;

export interface AppContext {
  txManager: AppTxManager;
  calendarService: CalendarService;
  notificationService: NotificationService;
  cronService: CronService;
  config: RuntimeConfig;
  shutdown: () => Promise<void>;
}

export function buildApp(options?: { databaseUrl?: string; env?: NodeJS.ProcessEnv }) {
  const config = loadConfig(options?.env ?? process.env);
  const databaseUrl = options?.databaseUrl ?? config.DATABASE_URL;
  let txManager: AppTxManager;
  let shutdown = async () => Promise.resolve();

  if (databaseUrl) {
    const pgClient = createPgClient(databaseUrl);
    txManager = new PgTransactionManager(pgClient.db);
    shutdown = async () => {
      await pgClient.pool.end();
    };
  } else {
    txManager = new InMemoryTransactionManager();
  }

  const calendarService = new CalendarService(txManager, new SimulatedGoogleMeetProvider());
  const notificationService = new NotificationService(txManager);
  const cronService = new CronService(txManager, new SimulatedContractGateway());

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await txManager.runInTransaction(async () => Promise.resolve());
      res.status(200).json({ status: 'ready', persistence: databaseUrl ? 'postgres' : 'in-memory' });
    } catch (_error) {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  app.use(authMiddleware);
  app.use(createCalendarRouter(calendarService, notificationService));
  app.use(errorHandler);

  return {
    app,
    context: {
      txManager,
      calendarService,
      notificationService,
      cronService,
      config,
      shutdown
    } satisfies AppContext
  };
}

export function startCron(cronService: CronService, expression = '0 * * * *') {
  if (!cron.validate(expression)) {
    throw new Error(`Invalid CRON expression: ${expression}`);
  }

  return cron.schedule(expression, async () => {
    await cronService.run(new Date());
  });
}
