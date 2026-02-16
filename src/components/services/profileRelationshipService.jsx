import { SheetsService } from './sheetsService';
import { GitHubService } from './githubService';

export class ProfileRelationshipService {
  /**
   * Process profile relationship data and augment existing attribute files
   */
  static async processProfileRelationships(config, mapping, githubRepo, githubToken) {
    // Read profile relationship data from sheet or file
    const data = config.uploadedFileUrl 
      ? await SheetsService.readUploadedFile(config.uploadedFileUrl)
      : await SheetsService.readSheet(config.sheetUrl);

    if (!data || data.length === 0) {
      throw new Error('No data found in the source');
    }

    // Validate mapping has AttributeIRI
    if (!mapping.AttributeIRI) {
      throw new Error('AttributeIRI field must be mapped');
    }

    // Get all existing attribute files from GitHub
    const attributeFiles = await GitHubService.getRepoFiles(
      githubRepo,
      config.outputDir || 'data',
      githubToken
    );

    // Read existing attribute files
    const attributeMap = new Map();
    const warnings = [];

    for (const file of attributeFiles) {
      if (file.name.endsWith('.json') && file.name !== (config.indexFileName || 'index.json')) {
        try {
          const content = await GitHubService.getFileContent(githubRepo, file.path, githubToken);
          const attributeData = JSON.parse(content.content);
          
          if (attributeData['@id']) {
            attributeMap.set(attributeData['@id'], {
              path: file.path,
              data: attributeData,
              sha: content.sha
            });
          }
        } catch (err) {
          console.error(`Failed to read ${file.path}:`, err);
        }
      }
    }

    // Process each row and augment attribute files
    const updates = new Map();
    
    for (const row of data) {
      const attributeIRI = row[mapping.AttributeIRI]?.trim();
      
      if (!attributeIRI) {
        warnings.push(`Row skipped: Missing AttributeIRI value`);
        continue;
      }

      const attribute = attributeMap.get(attributeIRI);
      
      if (!attribute) {
        warnings.push(`Row skipped: No attribute found for IRI "${attributeIRI}"`);
        continue;
      }

      // Create profile object using mapped columns
      const profileObject = {
        '@type': 'Relationship',
        'relationType': 'includeInProfile',
        'object': {
          '@id': mapping.ProfileIRI ? (row[mapping.ProfileIRI]?.trim() || '') : ''
        },
        'profileClass': mapping.ProfileClass ? (row[mapping.ProfileClass]?.trim() || '') : '',
        'profileAttributeIRI': mapping.ProfileAttributeIRI ? (row[mapping.ProfileAttributeIRI]?.trim() || '') : '',
        'profileAttributeLabel': mapping.ProfileAttributeLabel ? (row[mapping.ProfileAttributeLabel]?.trim() || '') : '',
        'profileAttributeAggregationType': mapping.AggregationType ? (row[mapping.AggregationType]?.trim() || '') : '',
        'profileBenchmark': mapping.Benchmark ? (row[mapping.Benchmark]?.trim() || '') : '',
        'ex:profileBenchmarkType': mapping.BenchmarkType ? (row[mapping.BenchmarkType]?.trim() || '') : ''
      };

      // Get or create the update entry for this attribute
      if (!updates.has(attributeIRI)) {
        updates.set(attributeIRI, {
          path: attribute.path,
          data: { ...attribute.data },
          sha: attribute.sha,
          profiles: []
        });
      }

      updates.get(attributeIRI).profiles.push(profileObject);
    }

    // Apply updates to attribute files
    const changes = [];
    
    for (const [attributeIRI, update] of updates) {
      // Initialize profiles array if it doesn't exist
      if (!update.data.profiles) {
        update.data.profiles = [];
      }

      // Append all profile objects
      update.data.profiles.push(...update.profiles);

      changes.push({
        path: update.path,
        content: JSON.stringify(update.data, null, 2),
        sha: update.sha,
        operation: 'update'
      });
    }

    return {
      changes,
      warnings,
      summary: {
        totalRows: data.length,
        filesUpdated: changes.length,
        rowsSkipped: warnings.length
      }
    };
  }

  /**
   * Preview changes that will be made
   */
  static async previewChanges(config, mapping, githubRepo, githubToken) {
    return await this.processProfileRelationships(config, mapping, githubRepo, githubToken);
  }
}