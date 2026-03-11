import { NextResponse } from 'next/server';

const WHITELIST2 = ['Winston Smith', 'Alex Chester', 'Henry Safety Department', 'Michael Cole'];

export async function GET() {
  try {
    const clientId = process.env.RC2_CLIENT_ID;
    const clientSecret = process.env.RC2_CLIENT_SECRET;
    const jwt = process.env.RC2_JWT;

    if (!clientId || !clientSecret || !jwt) {
      console.error('[account2/users] Missing env: RC2_CLIENT_ID=', !!clientId, 'RC2_CLIENT_SECRET=', !!clientSecret, 'RC2_JWT=', !!jwt);
      return NextResponse.json({ users: [] });
    }

    // Get token for account 2
    const encodedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('assertion', jwt);

    const tokenRes = await fetch('https://platform.ringcentral.com/restapi/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encodedAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[account2/users] Failed to get token:', tokenRes.status, errBody);
      return NextResponse.json({ users: [] });
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // Fetch users
    const usersRes = await fetch(
      'https://platform.ringcentral.com/restapi/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!usersRes.ok) {
      const errBody = await usersRes.text();
      console.error('[account2/users] Failed to fetch users:', usersRes.status, errBody);
      return NextResponse.json({ users: [] });
    }

    const usersData = await usersRes.json();
    const allUsers = usersData.records || [];
    const filtered = allUsers.filter((u: any) => WHITELIST2.includes(u.name));

    return NextResponse.json({ users: filtered });
  } catch (err) {
    console.error('[account2/users] Error:', err);
    return NextResponse.json({ users: [] });
  }
}