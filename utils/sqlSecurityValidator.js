/**
 * SQL Security Validator
 * Provides additional validation to prevent SQL injection attacks
 * Works in conjunction with parameterized queries for defense in depth
 */

class SQLSecurityValidator {
    /**
     * Validate table name to prevent SQL injection in dynamic table names
     * @param {string} tableName - Table name to validate
     * @returns {boolean} - Whether the table name is safe
     */
    static isValidTableName(tableName) {
        // Only allow alphanumeric characters and underscores
        const tableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        return tableNameRegex.test(tableName) && tableName.length <= 63; // PostgreSQL limit
    }

    /**
     * Validate column name to prevent SQL injection in dynamic column names
     * @param {string} columnName - Column name to validate
     * @returns {boolean} - Whether the column name is safe
     */
    static isValidColumnName(columnName) {
        // Only allow alphanumeric characters and underscores
        const columnNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        return columnNameRegex.test(columnName) && columnName.length <= 63; // PostgreSQL limit
    }

    /**
     * Validate ORDER BY clause to prevent SQL injection
     * @param {string} orderBy - ORDER BY clause to validate
     * @returns {boolean} - Whether the ORDER BY clause is safe
     */
    static isValidOrderBy(orderBy) {
        // Allow column names with optional ASC/DESC and comma separation
        const orderByRegex = /^[a-zA-Z_][a-zA-Z0-9_]*(\s+(ASC|DESC))?(\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*(\s+(ASC|DESC))?)*$/i;
        return orderByRegex.test(orderBy.trim()) && orderBy.length <= 200;
    }

    /**
     * Validate that a value is safe for use in dynamic SQL (when parameterization isn't possible)
     * @param {*} value - Value to validate
     * @returns {boolean} - Whether the value is safe
     */
    static isValidSQLValue(value) {
        if (value === null || value === undefined) return true;
        
        // Convert to string for validation
        const strValue = String(value);
        
        // Detect potential SQL injection patterns
        const dangerousPatterns = [
            /[';\\]/,                    // Semicolons and backslashes
            /--/,                        // SQL comments
            /\/\*/,                      // Multi-line comments start
            /\*\//,                      // Multi-line comments end
            /\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b/i,
            /\b(or|and)\s+\d+\s*=\s*\d+/i,  // Classic injection patterns like "1=1"
            /\b(or|and)\s+['"]\w+['"]?\s*=\s*['"]\w+['"]?/i  // String-based injections
        ];

        return !dangerousPatterns.some(pattern => pattern.test(strValue));
    }

    /**
     * Sanitize input for logging (remove potentially dangerous characters)
     * @param {string} input - Input to sanitize
     * @returns {string} - Sanitized input safe for logging
     */
    static sanitizeForLogging(input) {
        if (typeof input !== 'string') {
            input = String(input);
        }
        
        return input
            .replace(/[<>]/g, '')           // Remove angle brackets
            .replace(/['"]/g, '')           // Remove quotes
            .replace(/[;\\]/g, '')          // Remove semicolons and backslashes
            .replace(/--/g, '')             // Remove SQL comments
            .replace(/\/\*/g, '')           // Remove comment starts
            .replace(/\*\//g, '')           // Remove comment ends
            .substring(0, 100);             // Limit length for logs
    }

    /**
     * Validate parameter count matches placeholder count for additional security
     * @param {string} query - SQL query with placeholders
     * @param {Array} params - Parameters array
     * @returns {boolean} - Whether parameter count matches
     */
    static validateParameterCount(query, params) {
        // Count PostgreSQL placeholders ($1, $2, etc.)
        const placeholderMatches = query.match(/\$\d+/g);
        const placeholderCount = placeholderMatches ? placeholderMatches.length : 0;
        
        return placeholderCount === params.length;
    }

    /**
     * Validate that all placeholders are properly formatted
     * @param {string} query - SQL query to validate
     * @returns {boolean} - Whether all placeholders are valid
     */
    static hasValidPlaceholders(query) {
        // Check that all $ characters are followed by numbers (valid placeholders)
        const invalidPlaceholders = /\$(?!\d+\b)/g;
        return !invalidPlaceholders.test(query);
    }

    /**
     * Comprehensive query validation
     * @param {string} query - SQL query to validate
     * @param {Array} params - Parameters for the query
     * @returns {Object} - Validation result with details
     */
    static validateQuery(query, params = []) {
        const errors = [];

        if (!query || typeof query !== 'string') {
            errors.push('Query must be a non-empty string');
        }

        if (!Array.isArray(params)) {
            errors.push('Parameters must be an array');
        }

        if (query) {
            if (!this.hasValidPlaceholders(query)) {
                errors.push('Query contains invalid placeholder syntax');
            }

            if (!this.validateParameterCount(query, params)) {
                errors.push('Parameter count does not match placeholder count');
            }

            // Check for potential SQL injection attempts
            params.forEach((param, index) => {
                if (!this.isValidSQLValue(param)) {
                    errors.push(`Parameter ${index + 1} contains potentially dangerous content`);
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Create a safe table/column identifier (escapes with double quotes)
     * @param {string} identifier - Identifier to escape
     * @returns {string} - Safely escaped identifier
     */
    static escapeIdentifier(identifier) {
        if (!this.isValidColumnName(identifier) && !this.isValidTableName(identifier)) {
            throw new Error(`Invalid identifier: ${this.sanitizeForLogging(identifier)}`);
        }
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    /**
     * Validate and escape multiple identifiers
     * @param {Array<string>} identifiers - Array of identifiers to validate
     * @returns {Array<string>} - Array of escaped identifiers
     */
    static escapeIdentifiers(identifiers) {
        return identifiers.map(id => this.escapeIdentifier(id));
    }
}

module.exports = SQLSecurityValidator;