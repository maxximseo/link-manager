/**
 * Test notification timestamps
 */

async function testTimestamps() {
  const baseUrl = 'http://localhost:3003';

  // Login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'maximator', password: '*8NKDb6fXXLVu1h*' })
  });

  const { token } = await loginRes.json();
  console.log('Token obtained:', token.substring(0, 30) + '...');

  // Get notifications
  const notifsRes = await fetch(`${baseUrl}/api/notifications?limit=3`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const result = await notifsRes.json();

  console.log('\n=== Server time info ===');
  console.log('Current time (UTC):', new Date().toISOString());
  console.log('Current time (Local):', new Date().toString());

  console.log('\n=== Notification timestamps ===');
  if (result.data && result.data.length > 0) {
    result.data.forEach((n, i) => {
      const createdAt = new Date(n.created_at);
      const now = new Date();
      const diffMs = now - createdAt;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);

      console.log(`\n${i + 1}. "${n.title}"`);
      console.log(`   created_at raw: ${n.created_at}`);
      console.log(`   created_at parsed: ${createdAt.toString()}`);
      console.log(`   Diff: ${diffMins} min (${diffHours} hours)`);
      console.log(
        `   JS calculation says: ${diffHours > 0 ? diffHours + ' ч назад' : diffMins + ' мин назад'}`
      );
    });
  }

  // Check if timezone offset is the issue
  console.log('\n=== Timezone analysis ===');
  console.log('Local timezone offset:', new Date().getTimezoneOffset(), 'minutes');
  console.log('Expected offset for MSK (UTC+3):', -180, 'minutes');
}

testTimestamps().catch(console.error);
