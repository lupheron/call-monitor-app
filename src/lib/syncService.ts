import db from './db';

type Credentials = {
  clientId: string;
  clientSecret: string;
  jwt: string;
};

type SyncJob = {
  type: 'initial' | 'historical';
  dateFrom: string;
  dateTo: string;
  rangeName: string;
};

// Global state for Next.js hot-reloading
const globalAny = global as any;

if (!globalAny.syncState) {
  globalAny.syncState = {
    isProcessing: false,
    queue: [] as SyncJob[],
    lastRequestTime: 0,
    token: null as string | null,
    credentials: null as Credentials | null,
    status: 'idle' as 'idle' | 'syncing' | 'ready',
    currentRange: '',
    completedRanges: [] as string[]
  };
}

const state = globalAny.syncState;
const DELAY_BETWEEN_REQUESTS = 1200;

export function getSyncStatus() {
  return { 
    status: state.status, 
    range: state.currentRange,
    isProcessing: state.isProcessing,
    completedRanges: state.completedRanges
  };
}

export function initializeSync(credentials: Credentials) {
  state.credentials = credentials;
  
  // Clear queue and start fresh when re-initialized
  state.queue = [];
  state.completedRanges = [];
  
  const now = new Date();
  
  // 1. Initial job: Today's calls
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  
  state.queue.push({
    type: 'initial',
    dateFrom: todayStart.toISOString(),
    dateTo: now.toISOString(),
    rangeName: 'today'
  });

  // 2. Last 7 days
  const sevenDays = new Date(now);
  sevenDays.setDate(sevenDays.getDate() - 7);
  state.queue.push({
    type: 'historical',
    dateFrom: sevenDays.toISOString(),
    dateTo: todayStart.toISOString(),
    rangeName: 'weekly'
  });

  // 3. Last 30 days
  const thirtyDays = new Date(now);
  thirtyDays.setDate(thirtyDays.getDate() - 30);
  state.queue.push({
    type: 'historical',
    dateFrom: thirtyDays.toISOString(),
    dateTo: sevenDays.toISOString(),
    rangeName: 'monthly'
  });

  // 4. Last year
  const oneYear = new Date(now);
  oneYear.setFullYear(oneYear.getFullYear() - 1);
  state.queue.push({
    type: 'historical',
    dateFrom: oneYear.toISOString(),
    dateTo: thirtyDays.toISOString(),
    rangeName: 'yearly'
  });

  if (!state.isProcessing) {
    processQueue();
  }
}

export function queueCustomRange(dateFrom: string, dateTo: string) {
  state.queue.push({
    type: 'historical',
    dateFrom,
    dateTo,
    rangeName: 'custom'
  });
  
  if (!state.isProcessing) {
    processQueue();
  }
}

async function getAccessToken(): Promise<string> {
  if (state.token) return state.token;
  if (!state.credentials) throw new Error("No credentials provided");

  const { clientId, clientSecret, jwt } = state.credentials;
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

  if (!response.ok) {
    throw new Error('Failed to obtain token');
  }

  const data = await response.json();
  state.token = data.access_token;
  return state.token;
}

async function processQueue() {
  if (state.queue.length === 0) {
    state.status = 'ready';
    state.currentRange = '';
    state.isProcessing = false;
    return;
  }

  state.isProcessing = true;
  state.status = 'syncing';
  
  const job = state.queue.shift()!;
  state.currentRange = job.rangeName;

  try {
    const token = await getAccessToken();
    let page = 1;
    let hasMorePages = true;
    let consecutive429s = 0;
    let baseRetryDelay = 60000;

    const insertCall = db.prepare(`
      INSERT OR IGNORE INTO calls 
      (id, call_id, from_number, to_number, direction, result, user_extension, start_time, duration, recording_url)
      VALUES 
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    while (hasMorePages) {
      // Enforce 1200ms delay between requests
      const timeSinceLast = Date.now() - state.lastRequestTime;
      if (timeSinceLast < DELAY_BETWEEN_REQUESTS) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS - timeSinceLast));
      }

      state.lastRequestTime = Date.now();
      const url = `https://platform.ringcentral.com/restapi/v1.0/account/~/call-log?view=Detailed&dateFrom=${job.dateFrom}&dateTo=${job.dateTo}&perPage=100&page=${page}`;
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 429) {
        consecutive429s++;
        const retryAfter = res.headers.get('retry-after') || res.headers.get('x-rate-limit-window');
        let waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : baseRetryDelay * Math.pow(2, consecutive429s - 1);
        
        console.log(`[Queue] 429 Rate Limit hit. Waiting ${waitTime/1000}s...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue; // Retry the exact same page
      }

      consecutive429s = 0; // reset on success

      if (res.status === 401) { // Token expired
        state.token = null;
        await getAccessToken(); 
        continue; // Retry with new token
      }

      if (!res.ok) {
        console.error(`[Queue] API error ${res.status}: ${await res.text()}`);
        break; 
      }

      const data = await res.json();
      const records = data.records || [];

      // Start transaction for fast insertion
      const transaction = db.transaction((calls: any[]) => {
        for (const call of calls) {
          const fromNum = call.from?.phoneNumber || call.from?.extensionNumber || '';
          const toNum = call.to?.phoneNumber || call.to?.extensionNumber || '';
          const extId = call.extension?.id || '';

          insertCall.run(
            `${call.id}-${call.sessionId}`,
            call.id,
            fromNum,
            toNum,
            call.direction,
            call.result,
            extId,
            call.startTime,
            call.duration,
            call.recording?.contentUri || ''
          );
        }
      });

      transaction(records);

      if (records.length < 100) {
        hasMorePages = false;
      } else {
        page++;
      }
    }

    // Job finished successfully
    state.completedRanges.push(job.rangeName);

  } catch (err) {
    console.error(`[Queue] Job failed:`, err);
    // Depending on error, we might push the job back or skip. We are skipping for safety on total failure.
  }

  // Process next job
  setTimeout(processQueue, 0);
}
