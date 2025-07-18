import { NextResponse } from 'next/server';
import { runHealthChecks } from '../../../lib/health';

export async function GET() {
  const results = await runHealthChecks();
  const hasError = Object.values(results).some((r) => r.status === 'error');
  const hasPending = results.migrations.status === 'pending';
  const postgisNotFound = results.postgis.status === 'not found';

  let overallStatus = 200;
  if (hasError || postgisNotFound) {
    overallStatus = 503;
  } else if (hasPending) {
    overallStatus = 200; // Still healthy, but with a warning
  }

  return NextResponse.json(results, { status: overallStatus });
}