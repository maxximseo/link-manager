// Registration Module
const API_BASE = window.location.origin + '/api';

// Check if already logged in
if (localStorage.getItem('token') || localStorage.getItem('authToken')) {
    window.location.href = '/dashboard.html';
}

// Password strength indicator
function updatePasswordStrength(password) {
    const passwordHelp = document.getElementById('passwordHelp');

    if (!password) {
        passwordHelp.textContent = 'Minimum 8 characters';
        passwordHelp.style.color = '#64748b';
        return;
    }

    let strength = 0;
    let message = '';

    // Length check
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;

    // Character variety checks
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (password.length < 8) {
        message = '❌ Too short (min 8 characters)';
        passwordHelp.style.color = '#ef4444';
    } else if (strength <= 2) {
        message = '⚠️ Weak password';
        passwordHelp.style.color = '#f59e0b';
    } else if (strength <= 4) {
        message = '✅ Good password';
        passwordHelp.style.color = '#10b981';
    } else {
        message = '✅ Strong password';
        passwordHelp.style.color = '#059669';
    }

    passwordHelp.textContent = message;
}

// Password validation
function validatePasswords() {
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (confirmPassword && password !== confirmPassword) {
        return 'Passwords do not match';
    }

    if (password.length < 8) {
        return 'Password must be at least 8 characters long';
    }

    return null;
}

// Email validation
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return 'Please enter a valid email address';
    }
    return null;
}

// Username validation
function validateUsername(username) {
    if (username.length < 3) {
        return 'Username must be at least 3 characters long';
    }
    if (username.length > 50) {
        return 'Username must be less than 50 characters';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return 'Username can only contain letters, numbers, underscores and hyphens';
    }
    return null;
}

// Register function
async function register(username, email, password, confirmPassword, referralCode) {
    try {
        const body = { username, email, password, confirmPassword };
        if (referralCode) {
            body.referralCode = referralCode;
        }

        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        return data;
    } catch (error) {
        console.error('Registration error:', error);
        throw error;
    }
}

// Registration form handler
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    const registerBtn = document.getElementById('registerBtn');
    const registerText = document.getElementById('registerText');
    const registerSpinner = document.getElementById('registerSpinner');
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');

    // Client-side validation
    const usernameError = validateUsername(username);
    if (usernameError) {
        registerError.textContent = usernameError;
        registerError.classList.remove('hidden');
        return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
        registerError.textContent = emailError;
        registerError.classList.remove('hidden');
        return;
    }

    const passwordError = validatePasswords();
    if (passwordError) {
        registerError.textContent = passwordError;
        registerError.classList.remove('hidden');
        return;
    }

    // Show loading
    registerBtn.disabled = true;
    registerText.classList.add('hidden');
    registerSpinner.classList.remove('hidden');
    registerError.classList.add('hidden');
    registerSuccess.classList.add('hidden');

    try {
        const result = await register(username, email, password, confirmPassword);

        // Show success message
        registerSuccess.innerHTML = `
            <strong>✅ Registration successful!</strong><br>
            <span style="font-size: 0.9rem;">
                ${result.message || 'Your account has been created.'}
                <br><br>
                Redirecting to login page in 3 seconds...
            </span>
        `;
        registerSuccess.classList.remove('hidden');

        // Disable form
        document.getElementById('registerForm').querySelectorAll('input').forEach(input => {
            input.disabled = true;
        });

        // Redirect to login after 3 seconds
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);

    } catch (error) {
        // Show error message
        registerError.textContent = error.message;
        registerError.classList.remove('hidden');

        // Re-enable form
        registerBtn.disabled = false;
        registerText.classList.remove('hidden');
        registerSpinner.classList.add('hidden');
    }
});

// Real-time password strength indicator
document.getElementById('password').addEventListener('input', (e) => {
    updatePasswordStrength(e.target.value);
});

// Real-time password match indicator
document.getElementById('confirmPassword').addEventListener('input', (e) => {
    const password = document.getElementById('password').value;
    const confirmPassword = e.target.value;

    if (confirmPassword && password !== confirmPassword) {
        e.target.style.borderColor = '#ef4444';
    } else if (confirmPassword && password === confirmPassword) {
        e.target.style.borderColor = '#10b981';
    } else {
        e.target.style.borderColor = '';
    }
});

// Clear error on input
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
        document.getElementById('registerError').classList.add('hidden');
    });
});
