async function test() {
  // Login
  const loginResponse = await fetch('http://localhost:3003/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'maximator', password: '*8NKDb6fXXLVu1h*' })
  });

  const loginData = await loginResponse.json();

  if (!loginData.token) {
    console.error('❌ Login failed:', loginData);
    return;
  }

  console.log('✅ Logged in successfully');
  const token = loginData.token;

  // Test available slots API
  console.log('\n📡 Testing GET /api/rentals/1341/available?mode=owner');
  const response = await fetch('http://localhost:3003/api/rentals/1341/available?mode=owner', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const result = await response.json();

  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(result, null, 2));

  if (response.ok && result.data) {
    console.log('\n✅ API works correctly!');
    console.log('   Available slots:', result.data.available_slots);
    console.log('   Used links:', result.data.used_links);
    console.log('   Reserved slots:', result.data.reserved_slots);
    console.log('   Max links:', result.data.max_links);
  } else {
    console.log('\n❌ API failed');
  }
}

test().catch(console.error);
