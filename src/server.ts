import { buildApp, startCron } from './app';

const { app, context } = buildApp();
const cronTask = startCron(context.cronService, context.config.CRON_SCHEDULE);

const port = context.config.PORT;
const server = app.listen(port, () => {
  process.stdout.write(`Scheduler API running on port ${port}\n`);
});

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  cronTask.stop();

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await context.shutdown();
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('unhandledRejection', () => {
  void shutdown();
});

process.on('uncaughtException', () => {
  void shutdown();
});
