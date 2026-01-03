#!/usr/bin/env node

/**
 * Manual Authentication Test Script
 * Interactive script to test authentication endpoints
 * Usage: node scripts/test-auth.js
 */

const readline = require('readline');
const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api/auth`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Store tokens and user data
let accessToken = null;
let refreshToken = null;
let currentUser = null;

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function printSection(title) {
  console.log('\n' + '='.repeat(50));
  console.log(title);
  console.log('='.repeat(50) + '\n');
}

function printSuccess(message, data = null) {
  console.log(`✅ ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function printError(message, error = null) {
  console.log(`❌ ${message}`);
  if (error) {
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
  }
}

async function makeRequest(method, endpoint, data = null, useAuth = false) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (useAuth && accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error };
  }
}

async function testSignup() {
  printSection('Test Signup');

  const username = await question('Username: ');
  const email = await question('Email (optional, press Enter to skip): ');
  const password = await question('Password: ');
  const phone = await question('Phone (optional, E.164 format, e.g., +1234567890): ');
  const deviceId = await question('Device ID (optional, press Enter for default): ') || 'test-device-123';

  const signupData = {
    username,
    password,
    deviceId,
  };

  if (email) signupData.email = email;
  if (phone) {
    signupData.phone = phone;
    signupData.verificationMethod = 'sms';
  }

  const result = await makeRequest('POST', '/signup', signupData);

  if (result.success) {
    printSuccess('Signup successful!', result.data);
    if (result.data.data.user) {
      currentUser = result.data.data.user;
    }
    if (result.data.data.needsVerification) {
      console.log('\n⚠️  User needs verification. Use the verify endpoint next.');
    }
    return result.data.data.user?.id;
  } else {
    printError('Signup failed', result.error);
    return null;
  }
}

async function testVerify() {
  printSection('Test Verify');

  const userId = await question('User ID: ');
  const code = await question('Verification Code (6 digits): ');
  const method = await question('Method (sms/whatsapp) [sms]: ') || 'sms';

  const result = await makeRequest('POST', '/verify', {
    userId,
    code,
    method,
  });

  if (result.success) {
    printSuccess('Verification successful!', result.data);
    if (result.data.data.accessToken) {
      accessToken = result.data.data.accessToken;
      refreshToken = result.data.data.refreshToken;
      console.log('\n📝 Tokens stored for authenticated requests');
    }
    if (result.data.data.user) {
      currentUser = result.data.data.user;
    }
  } else {
    printError('Verification failed', result.error);
  }
}

async function testLogin() {
  printSection('Test Login');

  const email = await question('Email (or press Enter to use username): ');
  const username = email ? null : await question('Username: ');
  const password = await question('Password: ');

  const loginData = { password };
  if (email) loginData.email = email;
  if (username) loginData.username = username;

  const result = await makeRequest('POST', '/login', loginData);

  if (result.success) {
    printSuccess('Login successful!', result.data);
    if (result.data.data.accessToken) {
      accessToken = result.data.data.accessToken;
      refreshToken = result.data.data.refreshToken;
      console.log('\n📝 Tokens stored for authenticated requests');
    }
    if (result.data.data.user) {
      currentUser = result.data.data.user;
    }
  } else {
    printError('Login failed', result.error);
  }
}

async function testGetMe() {
  printSection('Test Get Current User');

  if (!accessToken) {
    printError('No access token. Please login first.');
    return;
  }

  const result = await makeRequest('GET', '/me', null, true);

  if (result.success) {
    printSuccess('Get user successful!', result.data);
    if (result.data.data.user) {
      currentUser = result.data.data.user;
    }
  } else {
    printError('Get user failed', result.error);
  }
}

async function testUpdateProfile() {
  printSection('Test Update Profile');

  if (!accessToken) {
    printError('No access token. Please login first.');
    return;
  }

  console.log('Leave fields empty to skip updating them.');
  const username = await question('New Username (optional): ');
  const email = await question('New Email (optional): ');
  const phone = await question('New Phone (optional, E.164 format): ');

  const updateData = {
    passwordConfirmed: true, // App handles password confirmation
  };

  if (username) updateData.username = username;
  if (email) updateData.email = email;
  if (phone) updateData.phone = phone;

  const result = await makeRequest('PUT', '/profile', updateData, true);

  if (result.success) {
    printSuccess('Profile update successful!', result.data);
    if (result.data.data.needsEmailVerification) {
      console.log('\n⚠️  Email change requires verification. Use verify-email endpoint.');
      if (result.data.data.code) {
        console.log(`📧 Verification code: ${result.data.data.code}`);
      }
    }
    if (result.data.data.user) {
      currentUser = result.data.data.user;
    }
  } else {
    printError('Profile update failed', result.error);
  }
}

async function testVerifyEmail() {
  printSection('Test Verify Email Change');

  if (!accessToken) {
    printError('No access token. Please login first.');
    return;
  }

  const code = await question('Verification Code (6 digits): ');

  const result = await makeRequest('POST', '/verify-email', { code }, true);

  if (result.success) {
    printSuccess('Email verification successful!', result.data);
    if (result.data.data.user) {
      currentUser = result.data.data.user;
    }
  } else {
    printError('Email verification failed', result.error);
  }
}

async function testChangePassword() {
  printSection('Test Change Password');

  if (!accessToken) {
    printError('No access token. Please login first.');
    return;
  }

  const currentPassword = await question('Current Password: ');
  const newPassword = await question('New Password: ');

  const result = await makeRequest(
    'PUT',
    '/password',
    {
      currentPassword,
      newPassword,
    },
    true
  );

  if (result.success) {
    printSuccess('Password change successful!', result.data);
  } else {
    printError('Password change failed', result.error);
  }
}

async function testDeleteAccount() {
  printSection('Test Delete Account');

  if (!accessToken) {
    printError('No access token. Please login first.');
    return;
  }

  const confirm = await question('Are you sure you want to delete your account? (yes/no): ');

  if (confirm.toLowerCase() !== 'yes') {
    console.log('Account deletion cancelled.');
    return;
  }

  const result = await makeRequest('DELETE', '/account', null, true);

  if (result.success) {
    printSuccess('Account deleted successfully!', result.data);
    accessToken = null;
    refreshToken = null;
    currentUser = null;
    console.log('\n📝 Tokens cleared');
  } else {
    printError('Account deletion failed', result.error);
  }
}

async function testRefreshToken() {
  printSection('Test Refresh Token');

  if (!refreshToken) {
    printError('No refresh token. Please login first.');
    return;
  }

  const result = await makeRequest('POST', '/refresh', {
    refreshToken,
  });

  if (result.success) {
    printSuccess('Token refresh successful!', result.data);
    if (result.data.data.accessToken) {
      accessToken = result.data.data.accessToken;
      console.log('\n📝 New access token stored');
    }
  } else {
    printError('Token refresh failed', result.error);
  }
}

async function testCheckUsername() {
  printSection('Test Check Username');

  const username = await question('Username to check: ');

  const result = await makeRequest('GET', `/check-username?username=${encodeURIComponent(username)}`);

  if (result.success) {
    printSuccess('Username check successful!', result.data);
  } else {
    printError('Username check failed', result.error);
  }
}

function showMenu() {
  printSection('Authentication Test Menu');
  console.log('1. Signup');
  console.log('2. Verify (OTP)');
  console.log('3. Login');
  console.log('4. Get Current User (me)');
  console.log('5. Update Profile');
  console.log('6. Verify Email Change');
  console.log('7. Change Password');
  console.log('8. Delete Account');
  console.log('9. Refresh Token');
  console.log('10. Check Username');
  console.log('11. Show Current Status');
  console.log('0. Exit');
  console.log('');
}

function showStatus() {
  printSection('Current Status');
  console.log('Access Token:', accessToken ? '✅ Set' : '❌ Not set');
  console.log('Refresh Token:', refreshToken ? '✅ Set' : '❌ Not set');
  if (currentUser) {
    console.log('\nCurrent User:');
    console.log(JSON.stringify(currentUser, null, 2));
  } else {
    console.log('Current User: ❌ Not set');
  }
}

async function main() {
  console.log('\n🚀 Authentication Test Script');
  console.log(`API Base URL: ${API_BASE}\n`);

  while (true) {
    showMenu();
    const choice = await question('Select an option: ');

    try {
      switch (choice) {
        case '1':
          await testSignup();
          break;
        case '2':
          await testVerify();
          break;
        case '3':
          await testLogin();
          break;
        case '4':
          await testGetMe();
          break;
        case '5':
          await testUpdateProfile();
          break;
        case '6':
          await testVerifyEmail();
          break;
        case '7':
          await testChangePassword();
          break;
        case '8':
          await testDeleteAccount();
          break;
        case '9':
          await testRefreshToken();
          break;
        case '10':
          await testCheckUsername();
          break;
        case '11':
          showStatus();
          break;
        case '0':
          console.log('\n👋 Goodbye!');
          rl.close();
          process.exit(0);
        default:
          console.log('❌ Invalid option. Please try again.');
      }
    } catch (error) {
      printError('An error occurred', error);
    }

    await question('\nPress Enter to continue...');
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  rl.close();
  process.exit(0);
});

// Start the script
main().catch((error) => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});

