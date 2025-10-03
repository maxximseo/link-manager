/**
 * Forms component - Form validation and handling utilities
 */

window.FormsComponent = {
    
    // Validate URL format
    validateUrl(url) {
        if (!url || typeof url !== 'string') {
            return { valid: false, error: 'URL is required' };
        }
        
        const urlPattern = /^https?:\/\/.+/;
        if (!urlPattern.test(url)) {
            return { valid: false, error: 'URL must be a valid HTTP/HTTPS URL' };
        }
        
        return { valid: true };
    },
    
    // Validate email format
    validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return { valid: false, error: 'Email is required' };
        }
        
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            return { valid: false, error: 'Invalid email format' };
        }
        
        return { valid: true };
    },
    
    // Validate required text fields
    validateRequired(value, fieldName) {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
            return { valid: false, error: `${fieldName} is required` };
        }
        
        return { valid: true };
    },
    
    // Validate text length
    validateLength(value, minLength, maxLength, fieldName) {
        if (value && value.length < minLength) {
            return { valid: false, error: `${fieldName} must be at least ${minLength} characters` };
        }
        
        if (value && value.length > maxLength) {
            return { valid: false, error: `${fieldName} must be less than ${maxLength} characters` };
        }
        
        return { valid: true };
    },
    
    // Sanitize HTML input
    sanitizeHtml(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    },
    
    // Show form error
    showFormError(formElement, message) {
        const errorDiv = formElement.querySelector('.form-error') || document.createElement('div');
        errorDiv.className = 'form-error';
        errorDiv.style.color = '#dc2626';
        errorDiv.style.marginTop = '10px';
        errorDiv.style.fontSize = '14px';
        errorDiv.textContent = message;
        
        if (!formElement.querySelector('.form-error')) {
            formElement.appendChild(errorDiv);
        }
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    },
    
    // Clear form errors
    clearFormErrors(formElement) {
        const errors = formElement.querySelectorAll('.form-error');
        errors.forEach(error => {
            if (error.parentNode) {
                error.parentNode.removeChild(error);
            }
        });
    },
    
    // Get form data as object
    getFormData(formElement) {
        const formData = new FormData(formElement);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        return data;
    },
    
    // Reset form
    resetForm(formElement) {
        formElement.reset();
        this.clearFormErrors(formElement);
    },
    
    // Validate entire form
    validateForm(formElement, validationRules) {
        this.clearFormErrors(formElement);
        const data = this.getFormData(formElement);
        const errors = [];
        
        for (const [field, rules] of Object.entries(validationRules)) {
            const value = data[field];
            
            if (rules.required) {
                const validation = this.validateRequired(value, rules.label || field);
                if (!validation.valid) {
                    errors.push(validation.error);
                    continue;
                }
            }
            
            if (rules.type === 'url' && value) {
                const validation = this.validateUrl(value);
                if (!validation.valid) {
                    errors.push(validation.error);
                }
            }
            
            if (rules.type === 'email' && value) {
                const validation = this.validateEmail(value);
                if (!validation.valid) {
                    errors.push(validation.error);
                }
            }
            
            if (rules.minLength || rules.maxLength) {
                const validation = this.validateLength(value, rules.minLength || 0, rules.maxLength || Infinity, rules.label || field);
                if (!validation.valid) {
                    errors.push(validation.error);
                }
            }
        }
        
        if (errors.length > 0) {
            this.showFormError(formElement, errors[0]);
            return { valid: false, errors };
        }
        
        return { valid: true, data };
    },
    
    // Handle form submission with validation
    handleSubmit(formElement, validationRules, submitCallback) {
        formElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const validation = this.validateForm(formElement, validationRules);
            
            if (validation.valid) {
                try {
                    await submitCallback(validation.data);
                    this.resetForm(formElement);
                } catch (error) {
                    this.showFormError(formElement, error.message || 'Submission failed');
                }
            }
        });
    },
    
    // Create form field with validation
    createField(type, name, label, required = false, placeholder = '') {
        return `
            <div class="form-group">
                <label for="${name}">${label}${required ? ' *' : ''}</label>
                <input type="${type}" 
                       id="${name}" 
                       name="${name}" 
                       ${required ? 'required' : ''} 
                       placeholder="${placeholder}"
                       class="form-control">
            </div>
        `;
    },
    
    // Create textarea field
    createTextarea(name, label, required = false, placeholder = '', rows = 4) {
        return `
            <div class="form-group">
                <label for="${name}">${label}${required ? ' *' : ''}</label>
                <textarea id="${name}" 
                          name="${name}" 
                          ${required ? 'required' : ''} 
                          placeholder="${placeholder}"
                          rows="${rows}"
                          class="form-control"></textarea>
            </div>
        `;
    }
    
};

// Global exports for compatibility
window.validateUrl = (url) => window.FormsComponent.validateUrl(url);
window.validateEmail = (email) => window.FormsComponent.validateEmail(email);
window.validateRequired = (value, fieldName) => window.FormsComponent.validateRequired(value, fieldName);
window.showFormError = (form, message) => window.FormsComponent.showFormError(form, message);
window.clearFormErrors = (form) => window.FormsComponent.clearFormErrors(form);
window.getFormData = (form) => window.FormsComponent.getFormData(form);
window.validateForm = (form, rules) => window.FormsComponent.validateForm(form, rules);

console.log('✅ Forms component loaded successfully');