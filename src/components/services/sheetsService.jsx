/**
 * Google Sheets Service Layer
 * 
 * This service handles reading data from Google Sheets.
 * Uses the public CSV export feature for simplicity (no OAuth required).
 * For private sheets, this would need to be replaced with proper Google Sheets API.
 */

export class SheetsService {
  /**
   * Extract spreadsheet ID from Google Sheets URL
   */
  static extractSpreadsheetId(url) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Sheets URL');
    }
    return match[1];
  }

  /**
   * Extract sheet GID from URL (if present)
   */
  static extractSheetGid(url) {
    const match = url.match(/[#&]gid=([0-9]+)/);
    return match ? match[1] : '0';
  }

  /**
   * Read data from Google Sheet
   * Returns array of objects with column headers as keys
   */
  static async readSheet(sheetUrl) {
    try {
      const spreadsheetId = this.extractSpreadsheetId(sheetUrl);
      const gid = this.extractSheetGid(sheetUrl);
      
      // Use the CSV export feature
      const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
      
      const response = await fetch(csvUrl);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Sheet not found. Please check the URL and make sure the sheet exists.');
        }
        if (response.status === 403) {
          throw new Error('Access denied. Make sure the sheet is set to "Anyone with the link can view".');
        }
        if (response.status === 400) {
          throw new Error('Invalid request to Google Sheets. The URL may be malformed or the sheet ID/GID is invalid. Try uploading a CSV/XLSX file instead.');
        }
        throw new Error(`Failed to fetch sheet (status ${response.status}). Consider uploading a CSV/XLSX file instead.`);
      }

      const csvText = await response.text();
      if (!csvText.trim()) {
        throw new Error('Sheet is empty or contains no data.');
      }
      
      return this.parseCSV(csvText);
    } catch (error) {
      if (error.message.includes('Invalid Google Sheets URL')) {
        throw error;
      }
      if (error.message.includes('fetch') && !error.message.includes('Failed to fetch sheet')) {
        throw new Error('Network error while accessing Google Sheets.');
      }
      throw error;
    }
  }

  /**
   * Parse CSV text into array of objects
   */
  static parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return [];
    }

    // Parse headers
    const headers = this.parseCSVLine(lines[0]);
    
    // Parse rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return rows;
  }

  /**
   * Parse a single CSV line (handles quoted values)
   */
  static parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * Read data from an uploaded file (CSV or XLSX)
   */
  static async readUploadedFile(fileUrl) {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch uploaded file');
      }

      const contentType = response.headers.get('content-type');
      const fileName = fileUrl.split('/').pop();
      
      if (fileName.endsWith('.csv') || contentType?.includes('text/csv')) {
        const csvText = await response.text();
        return this.parseCSV(csvText);
      } else if (fileName.endsWith('.xlsx') || contentType?.includes('spreadsheet')) {
        // Use Base44 integration to extract data from XLSX
        const { base44 } = await import('@/api/base44Client');
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: fileUrl,
          json_schema: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: { type: 'string' }
            }
          }
        });

        if (result.status === 'error') {
          throw new Error(result.details || 'Failed to extract data from file');
        }

        return result.output;
      } else {
        throw new Error('Unsupported file format. Please upload a CSV or XLSX file.');
      }
    } catch (error) {
      throw new Error(`Failed to read uploaded file: ${error.message}`);
    }
  }

  /**
   * Get sheet columns (headers)
   */
  static async getSheetColumns(sheetUrl) {
    const data = await this.readSheet(sheetUrl);
    if (data.length === 0) {
      return [];
    }
    return Object.keys(data[0]);
  }

  /**
   * Get columns from uploaded file
   */
  static async getUploadedFileColumns(fileUrl) {
    const data = await this.readUploadedFile(fileUrl);
    if (data.length === 0) {
      return [];
    }
    return Object.keys(data[0]);
  }
}