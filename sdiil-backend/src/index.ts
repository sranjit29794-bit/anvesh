import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabaseAdmin } from './lib/supabaseAdmin.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Security & Parsing Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json());

/**
 * Health check endpoint.
 * Returns service status and verifies connectivity to Supabase.
 */
app.get('/health', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('count', { count: 'exact', head: true });

    const latencyMs = Date.now() - startTime;

    if (error) {
      return res.status(503).json({
        status: 'DEGRADED',
        service: 'sdiil-backend',
        timestamp: new Date().toISOString(),
        supabase: {
          connected: false,
          latencyMs,
          error: error.message,
          code: error.code,
          hint: error.hint || 'Ensure Supabase migrations have been pushed to create the profiles table.',
        },
      });
    }

    return res.status(200).json({
      status: 'HEALTHY',
      service: 'sdiil-backend',
      timestamp: new Date().toISOString(),
      supabase: {
        connected: true,
        latencyMs,
      },
    });
  } catch (err: any) {
    return res.status(503).json({
      status: 'DEGRADED',
      service: 'sdiil-backend',
      timestamp: new Date().toISOString(),
      supabase: {
        connected: false,
        error: err?.message || 'Supabase connection failed',
      },
    });
  }
});

/**
 * Root endpoint returning service identification and API status.
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Secure Document Intelligence & Integrity Layer (SDIIL) API',
    prototype: 'ICJS Integrated Criminal Justice System',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      docs: '/api/v1/documents',
      auth: '/auth',
      search: '/api/v1/search',
      sharing: '/api/v1/sharing',
      verification: '/api/v1/verify',
    },
  });
});

app.listen(PORT, () => {
  console.log(`[SDIIL Backend] Server running on http://localhost:${PORT}`);
  console.log(`[SDIIL Backend] Supabase URL configured: ${Boolean(process.env.SUPABASE_URL)}`);
});
