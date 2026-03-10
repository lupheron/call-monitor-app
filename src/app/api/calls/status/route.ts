import { NextResponse } from 'next/server';
import { getSyncStatus, initializeSync } from '@/lib/syncService';

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret, jwt } = await request.json();
    
    if (!clientId || !clientSecret || !jwt) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const statusObj = getSyncStatus();
    if (statusObj.status === 'idle' && statusObj.completedRanges.length === 0) {
      initializeSync({ clientId, clientSecret, jwt });
    }

    return NextResponse.json(getSyncStatus());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(getSyncStatus());
}
