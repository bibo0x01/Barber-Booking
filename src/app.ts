import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { createCorsOptions } from './config/cors';
import { errorMiddleware } from './middlewares/error.middleware';
import { notFoundMiddleware } from './middlewares/not-found.middleware';
import { router } from './routes';

export const app = express();

app.use(helmet());
app.use(cors(createCorsOptions(env.nodeEnv, env.corsAllowedOrigins)));

if (env.nodeEnv !== 'production') {
	const openApiDocument = JSON.parse(readFileSync(path.join(process.cwd(), 'docs/openapi.json'), 'utf8'));
	openApiDocument.servers = [{ url: env.apiPrefix, description: 'Configured API prefix' }];
	const swaggerContentSecurityPolicy: express.RequestHandler = (_request, response, next) => {
		response.setHeader(
			'Content-Security-Policy',
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
		);
		next();
	};

	app.get('/api-docs/openapi.json', swaggerContentSecurityPolicy, (_request, response) => response.json(openApiDocument));
	app.use('/api-docs', swaggerContentSecurityPolicy, swaggerUi.serve, swaggerUi.setup(openApiDocument));
}

app.use(express.json({ limit: '1mb' }));
app.use(env.apiPrefix, router);
app.use(notFoundMiddleware);
app.use(errorMiddleware);