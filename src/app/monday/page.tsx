'use client';

import MondayDashboard from '@/components/MondayDashboard/MondayDashboard';

export default function MondayPage() {
  return (
    <div style={{ minHeight: '100vh', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <MondayDashboard embedded={false} />
    </div>
  );
}
