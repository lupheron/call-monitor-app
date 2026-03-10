import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const p = await params;
    const pathString = p.path.join('/');
    
    const rcAuthHeader = request.headers.get('x-rc-auth');
    if (!rcAuthHeader) {
      return NextResponse.json({ error: 'Missing x-rc-auth header' }, { status: 401 });
    }

    const { search } = new URL(request.url);
    const targetUrl = `https://platform.ringcentral.com/restapi/${pathString}${search}`;

    const rcResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${rcAuthHeader}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await rcResponse.json();

    if (!rcResponse.ok) {
        return NextResponse.json(
            { error: data.message || `RingCentral API error: ${rcResponse.status}` },
            { status: rcResponse.status }
        );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error proxying to RingCentral' },
      { status: 500 }
    );
  }
}
