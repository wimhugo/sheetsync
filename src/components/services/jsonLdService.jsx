/**
 * JSON-LD Service Layer
 * 
 * Handles generation of JSON-LD files from sheet data based on schema mapping.
 */

export class JsonLdService {
  /**
   * Generate JSON-LD files from sheet rows
   * 
   * @param {Array} rows - Sheet data rows
   * @param {Object} schema - Target JSON-LD schema
   * @param {Object} mapping - Column to schema field mapping
   * @param {Object} config - Additional configuration (fileNameColumn, outputDir, etc.)
   * @returns {Array} Array of {fileName, content} objects
   */
  static generateFiles(rows, schema, mapping, config = {}) {
    const files = [];
    const fileNameColumn = config.fileNameColumn || Object.keys(mapping)[0];

    for (const row of rows) {
      // Skip empty rows
      if (this.isEmptyRow(row)) {
        continue;
      }

      const fileName = this.sanitizeFileName(row[fileNameColumn] || `item-${files.length + 1}`);
      const jsonLd = this.applyMapping(row, schema, mapping);
      
      files.push({
        fileName: `${fileName}.json`,
        content: JSON.stringify(jsonLd, null, 2)
      });
    }

    return files;
  }

  /**
   * Apply mapping to convert row data to JSON-LD structure
   */
  static applyMapping(row, schema, mapping) {
    const result = { ...schema };

    // Apply each mapping
    for (const [columnName, schemaPath] of Object.entries(mapping)) {
      if (!schemaPath || schemaPath === '') continue;

      const value = row[columnName];
      if (value === undefined || value === null || value === '') {
        continue;
      }

      // Set nested property using path (e.g., "person.name")
      this.setNestedProperty(result, schemaPath, value);
    }

    return result;
  }

  /**
   * Set nested property in object using dot notation
   */
  static setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    
    // Try to parse as JSON if it looks like an array or object
    if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
      try {
        current[lastKey] = JSON.parse(value);
        return;
      } catch (e) {
        // If parsing fails, use as string
      }
    }

    current[lastKey] = value;
  }

  /**
   * Generate index/inventory file from all JSON-LD files
   */
  static generateIndexFile(files, config = {}) {
    const indexFileName = config.indexFileName || 'index.json';
    const items = files.map(f => {
      try {
        const data = JSON.parse(f.content);
        return {
          file: f.fileName,
          id: data['@id'] || data.id || f.fileName,
          type: data['@type'] || data.type,
          name: data.name || data.title || f.fileName.replace('.json', '')
        };
      } catch (e) {
        return {
          file: f.fileName,
          error: 'Failed to parse JSON'
        };
      }
    });

    const index = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items,
      dateModified: new Date().toISOString()
    };

    return {
      fileName: indexFileName,
      content: JSON.stringify(index, null, 2)
    };
  }

  /**
   * Check if a row is empty (all values are empty strings or null)
   */
  static isEmptyRow(row) {
    return Object.values(row).every(v => v === '' || v === null || v === undefined);
  }

  /**
   * Sanitize filename to be filesystem-safe
   */
  static sanitizeFileName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100);
  }

  /**
   * Extract all possible field paths from a schema object
   * Used for the mapping UI to show available fields
   */
  static extractSchemaPaths(schema, prefix = '') {
    const paths = [];

    for (const [key, value] of Object.entries(schema)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recurse into nested objects
        paths.push(currentPath);
        paths.push(...this.extractSchemaPaths(value, currentPath));
      } else {
        paths.push(currentPath);
      }
    }

    return paths;
  }
}