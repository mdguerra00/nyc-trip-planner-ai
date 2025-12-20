/**
 * Input Sanitization Module
 * Protects against prompt injection and malicious input
 */

// Maximum lengths for different field types
const MAX_LENGTHS = {
  message: 2000,
  title: 200,
  address: 500,
  description: 1000,
  notes: 1000,
  region: 100,
  topic: 200,
  context: 5000,
  suggestions: 10000,
  generic: 500,
};

// Suspicious patterns that might indicate prompt injection
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(previous|all|above)\s+instructions/i,
  /disregard\s+(previous|all|above)/i,
  /forget\s+(everything|all|previous)/i,
  /you\s+are\s+now/i,
  /new\s+instructions?:/i,
  /system\s*prompt/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<<SYS>>/i,
  /<\/SYS>>/i,
  /assistant:/i,
  /human:/i,
  /user:/i,
];

/**
 * Removes potentially dangerous characters and patterns from input
 */
function removeControlCharacters(input: string): string {
  // Remove null bytes and other control characters (except newlines and tabs)
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Checks if input contains suspicious prompt injection patterns
 */
function containsSuspiciousPatterns(input: string): boolean {
  return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Escapes special markdown/formatting characters that could affect AI parsing
 */
function escapeFormattingCharacters(input: string): string {
  // Escape backticks to prevent code injection
  return input.replace(/`{3,}/g, '```');
}

/**
 * Sanitizes a string input for safe use in AI prompts
 */
export function sanitizeInput(
  input: string | null | undefined,
  fieldType: keyof typeof MAX_LENGTHS = 'generic'
): string {
  if (!input) return '';
  
  let sanitized = String(input);
  
  // Step 1: Remove control characters
  sanitized = removeControlCharacters(sanitized);
  
  // Step 2: Trim whitespace
  sanitized = sanitized.trim();
  
  // Step 3: Enforce maximum length
  const maxLength = MAX_LENGTHS[fieldType] || MAX_LENGTHS.generic;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    console.warn(`Input truncated to ${maxLength} characters for field type: ${fieldType}`);
  }
  
  // Step 4: Escape formatting characters
  sanitized = escapeFormattingCharacters(sanitized);
  
  return sanitized;
}

/**
 * Validates input and returns sanitized version with warning if suspicious
 */
export function validateAndSanitize(
  input: string | null | undefined,
  fieldType: keyof typeof MAX_LENGTHS = 'generic'
): { value: string; hasSuspiciousContent: boolean } {
  const sanitized = sanitizeInput(input, fieldType);
  const hasSuspiciousContent = containsSuspiciousPatterns(sanitized);
  
  if (hasSuspiciousContent) {
    console.warn(`⚠️ Suspicious content detected in ${fieldType} field`);
  }
  
  return { value: sanitized, hasSuspiciousContent };
}

/**
 * Sanitizes an object's string fields recursively
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  fieldTypes: Partial<Record<keyof T, keyof typeof MAX_LENGTHS>> = {}
): T {
  const result = { ...obj } as T;
  
  for (const key of Object.keys(result) as Array<keyof T>) {
    const value = result[key];
    
    if (typeof value === 'string') {
      const fieldType = fieldTypes[key] || 'generic';
      (result as Record<string, unknown>)[key as string] = sanitizeInput(value, fieldType);
    } else if (Array.isArray(value)) {
      (result as Record<string, unknown>)[key as string] = value.map(item => {
        if (typeof item === 'string') {
          return sanitizeInput(item, 'generic');
        }
        if (typeof item === 'object' && item !== null) {
          return sanitizeObject(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      (result as Record<string, unknown>)[key as string] = sanitizeObject(value as Record<string, unknown>);
    }
  }
  
  return result;
}

/**
 * Logs potentially malicious input for security monitoring
 */
export function logSuspiciousInput(
  userId: string,
  functionName: string,
  input: string,
  fieldName: string
): void {
  // Only log first 200 chars to avoid log pollution
  const truncatedInput = input.substring(0, 200);
  console.warn(`🚨 SECURITY: Suspicious input detected`, {
    userId,
    functionName,
    fieldName,
    inputPreview: truncatedInput,
    timestamp: new Date().toISOString(),
  });
}
