import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret, jwt } = await request.json();

    if (!clientId || !clientSecret || !jwt) {
      return NextResponse.json(
        { error: 'Missing clientId, clientSecret, or jwt' },
        { status: 400 }
      );
    }

    const encodedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('assertion', jwt);

    const response = await fetch('https://platform.ringcentral.com/restapi/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encodedAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error_description || data.message || 'Failed to authenticate' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
