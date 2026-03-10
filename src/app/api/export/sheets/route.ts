import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

interface UserStats {
  userId: number;
  name: string;
  totalCalls: number;
  talkTime: number;
  outbound: number;
  inbound: number;
  missed: number;
  voicemail: number;
  hangups: number;
  under20s: number;
  avgDuration: number;
}

export async function POST(request: NextRequest) {
  try {
    const { data, accessToken }: { data: UserStats[]; accessToken: string } = await request.json();
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const date = new Date().toISOString().split('T')[0];
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: `RingCentral Report — ${date}`,
        },
        sheets: [
          { properties: { title: 'Summary' } },
          { properties: { title: 'Daily Breakdown' } },
          { properties: { title: 'Top Talkers' } },
        ],
      },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId!;
    const summaryData = [
      ['Name', 'Total Calls', 'Talk Time', 'Outbound', 'Inbound', 'Missed', 'Voicemail', 'Hangups', 'Under 20s', 'Avg Duration'],
      ...data.map(stat => [
        stat.name,
        stat.totalCalls,
        `${Math.floor(stat.talkTime / 3600)}h ${Math.floor((stat.talkTime % 3600) / 60)}m`,
        stat.outbound,
        stat.inbound,
        stat.missed,
        stat.voicemail,
        stat.hangups,
        stat.under20s,
        `${Math.round(stat.avgDuration)}s`,
      ]),
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Summary!A1',
      valueInputOption: 'RAW',
      requestBody: { values: summaryData },
    });
    const dailyData = [
      ['Date', 'User', 'Calls', 'Talk Time'],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Daily Breakdown!A1',
      valueInputOption: 'RAW',
      requestBody: { values: dailyData },
    });

    const topTalkersData = [
      ['Rank', 'Name', 'Talk Time'],
      ...data
        .sort((a, b) => b.talkTime - a.talkTime)
        .map((stat, index) => [
          index + 1,
          stat.name,
          `${Math.floor(stat.talkTime / 3600)}h ${Math.floor((stat.talkTime % 3600) / 60)}m`,
        ]),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Top Talkers!A1',
      valueInputOption: 'RAW',
      requestBody: { values: topTalkersData },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    return NextResponse.json({ sheetUrl });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}