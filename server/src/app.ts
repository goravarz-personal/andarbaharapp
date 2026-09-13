import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { env } from './lib/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { generalLimiter } from './middleware/rateLimit';

export function createApp(): Express {
  const app = express();

  // Behind a host's load balancer, req.ip is the balancer unless we say how
  // many proxies to look through. Rate limiting depends on getting this right.
  if (env.trustProxy > 0) app.set('trust proxy', env.trustProxy);

  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((o) => o.trim()),
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }
  app.use(generalLimiter);

  app.use('/api', apiRouter);

  // Anything that is not the API is the app itself asking for a page. There is
  // no page here - the app is served separately - so say so plainly.
  app.get('/', (_req, res) => {
    res.json({
      service: 'AadarBahar API',
      health: '/api/health',
      app: env.corsOrigin === '*' ? undefined : env.corsOrigin.split(',')[0],
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
