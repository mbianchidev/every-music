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
    
    const localPart = atParts[0];
    const domainPart = atParts[1];
    
    // Check for whitespace (avoid regex)
    if (localPart.includes(' ') || domainPart.includes(' ') || 
        localPart.includes('\t') || domainPart.includes('\t') ||
        localPart.includes('\n') || domainPart.includes('\n')) {
      return { valid: false, message: 'Invalid email format' };
    }
    
    // Domain must contain at least one dot
    const domainParts = domainPart.split('.');
    if (domainParts.length < 2 || domainParts.some(part => !part)) {
      return { valid: false, message: 'Invalid email format' };
    }
    
    return { valid: true };
  }

  static validatePassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
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
    if (value !== null && value !== undefined) {
      if (typeof value !== 'string') {
        return { valid: false, message: `${fieldName} must be text` };
      }

      if (value.length < min || value.length > max) {
        return { valid: false, message: `${fieldName} must be between ${min} and ${max} characters` };
      }
    }
    return { valid: true };
  }

  static validateAge(age) {
    if (age !== null && age !== undefined) {
      if (!Number.isInteger(age) || age < 13 || age > 120) {
        return { valid: false, message: 'Age must be between 13 and 120' };
      }
    }
    return { valid: true };
  }

  static validateUrl(url) {
    if (!url) return { valid: true };
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { valid: false, message: 'URL must use HTTP or HTTPS' };
      }
      return { valid: true };
    } catch {
      return { valid: false, message: 'Invalid URL format' };
    }
  }

  static validateCoordinates(latitude, longitude) {
    const hasLatitude = latitude !== null && latitude !== undefined;
    const hasLongitude = longitude !== null && longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      return { valid: false, message: 'Latitude and longitude must be provided together' };
    }

    if (hasLatitude && hasLongitude) {
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        return { valid: false, message: 'Latitude must be between -90 and 90' };
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
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
    if (value !== null && value !== undefined && !Array.isArray(value)) {
      return { valid: false, message: `${fieldName} must be an array` };
    }
    return { valid: true };
  }

  static validateBoolean(value, fieldName) {
    if (value !== null && value !== undefined && typeof value !== 'boolean') {
      return { valid: false, message: `${fieldName} must be true or false` };
    }
    return { valid: true };
  }

  static parseOptionalBoolean(value, fieldName) {
    if (value === null || value === undefined || value === '') {
      return { valid: true, value: undefined };
    }

    if (value === true || value === 'true') {
      return { valid: true, value: true };
    }

    if (value === false || value === 'false') {
      return { valid: true, value: false };
    }

    return { valid: false, message: `${fieldName} must be true or false` };
  }

  static validateUuidArray(value, fieldName) {
    const arrayValidation = this.validateArray(value, fieldName);
    if (!arrayValidation.valid || value === null || value === undefined) {
      return arrayValidation;
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (value.some((item) => typeof item !== 'string' || !uuidPattern.test(item))) {
      return { valid: false, message: `${fieldName} must contain valid UUIDs` };
    }

    return { valid: true };
  }

  static validateUuid(value, fieldName) {
    if (value === null || value === undefined || value === '') {
      return { valid: true };
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return typeof value === 'string' && uuidPattern.test(value)
      ? { valid: true }
      : { valid: false, message: `${fieldName} must be a valid UUID` };
  }

  static validateInstruments(value) {
    const arrayValidation = this.validateArray(value, 'Instruments');
    if (!arrayValidation.valid || value === null || value === undefined) {
      return arrayValidation;
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const skillLevels = ['beginner', 'intermediate', 'advanced', 'professional'];
    const invalid = value.some((instrument) => !instrument
      || !uuidPattern.test(instrument.instrumentId)
      || (instrument.yearsExperience !== undefined
        && (!Number.isInteger(instrument.yearsExperience) || instrument.yearsExperience < 0))
      || (instrument.skillLevel !== undefined && !skillLevels.includes(instrument.skillLevel)));

    return invalid
      ? { valid: false, message: 'Instruments contain invalid values' }
      : { valid: true };
  }

  static validateLinks(value) {
    const arrayValidation = this.validateArray(value, 'Links');
    if (!arrayValidation.valid || value === null || value === undefined) {
      return arrayValidation;
    }

    const linkTypes = ['spotify', 'youtube', 'soundcloud', 'bandcamp', 'website', 'other'];
    const invalid = value.some((link) => !link
      || !linkTypes.includes(link.linkType || 'other')
      || !this.validateUrl(link.url).valid);

    return invalid
      ? { valid: false, message: 'Links contain invalid values' }
      : { valid: true };
  }

  static gatherValidationErrors(...validations) {
    const errors = validations
      .filter(v => !v.valid)
      .map(v => v.message);
    
    return errors.length > 0 ? errors : null;
  }

  static parsePagination(pageValue = 1, pageSizeValue = 20, maximumPageSize = 100) {
    const page = Number.parseInt(pageValue, 10);
    const pageSize = Number.parseInt(pageSizeValue, 10);

    if (!Number.isInteger(page) || page < 1) {
      return { valid: false, message: 'Page must be a positive integer' };
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maximumPageSize) {
      return {
        valid: false,
        message: `Page size must be between 1 and ${maximumPageSize}`,
      };
    }

    return {
      valid: true,
      pagination: { page, pageSize },
    };
  }
}
