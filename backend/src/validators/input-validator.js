export class InputValidator {
  static validateEmail(email) {
    // Non-ReDoS email validation using split-based approach
    if (!email || typeof email !== 'string' || email.length > 320 || email.length < 3) {
      return { valid: false, message: 'Invalid email format' };
    }
    
    // Split by @ and validate structure
    const atParts = email.split('@');
    if (atParts.length !== 2 || !atParts[0] || !atParts[1]) {
      return { valid: false, message: 'Invalid email format' };
    }
    
    const localSegment = atParts[0];
    const domainSegment = atParts[1];
    
    // Check for whitespace (avoid regex)
    if (localSegment.includes(' ') || domainSegment.includes(' ') || 
        localSegment.includes('\t') || domainSegment.includes('\t') ||
        localSegment.includes('\n') || domainSegment.includes('\n')) {
      return { valid: false, message: 'Invalid email format' };
    }
    
    // Domain must contain at least one dot
    const domainParts = domainSegment.split('.');
    if (domainParts.length < 2 || domainParts.some(part => !part)) {
      return { valid: false, message: 'Invalid email format' };
    }
    
    return { valid: true };
  }

  static validatePassword(password) {
    if (!password || password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    return { valid: true };
  }

  static validateRequired(value, fieldName) {
    if (value === null || value === undefined || value === '') {
      return { valid: false, message: `${fieldName} is required` };
    }
    return { valid: true };
  }

  static validateLength(value, min, max, fieldName) {
    if (value && (value.length < min || value.length > max)) {
      return { valid: false, message: `${fieldName} must be between ${min} and ${max} characters` };
    }
    return { valid: true };
  }

  static validateAge(age) {
    if (age !== null && age !== undefined) {
      if (age < 13 || age > 120) {
        return { valid: false, message: 'Age must be between 13 and 120' };
      }
    }
    return { valid: true };
  }

  static validateUrl(url) {
    if (!url) return { valid: true };
    try {
      new URL(url);
      return { valid: true };
    } catch {
      return { valid: false, message: 'Invalid URL format' };
    }
  }

  static validateCoordinates(latitude, longitude) {
    if ((latitude !== null && latitude !== undefined) || 
        (longitude !== null && longitude !== undefined)) {
      if (latitude < -90 || latitude > 90) {
        return { valid: false, message: 'Latitude must be between -90 and 90' };
      }
      if (longitude < -180 || longitude > 180) {
        return { valid: false, message: 'Longitude must be between -180 and 180' };
      }
    }
    return { valid: true };
  }

  static validateEnum(value, allowedValues, fieldName) {
    if (value && !allowedValues.includes(value)) {
      return { valid: false, message: `${fieldName} must be one of: ${allowedValues.join(', ')}` };
    }
    return { valid: true };
  }

  static validateArray(value, fieldName) {
    if (value && !Array.isArray(value)) {
      return { valid: false, message: `${fieldName} must be an array` };
    }
    return { valid: true };
  }

  static gatherValidationErrors(...validations) {
    const errors = validations
      .filter(v => !v.valid)
      .map(v => v.message);
    
    return errors.length > 0 ? errors : null;
  }
}
