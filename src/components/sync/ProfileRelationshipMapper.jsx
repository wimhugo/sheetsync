import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowRight, Download, Upload, Trash2, Loader2, FileCode } from 'lucide-react';
import { SheetsService } from '../services/sheetsService';
import { GitHubService } from '../services/githubService';
import { JsonLdService } from '../services/jsonLdService';

const DEFAULT_PROFILE_FIELDS = [
  'AttributeIRI',
  'ProfileIRI',
  'ProfileClass',
  'ProfileAttributeIRI',
  'ProfileAttributeLabel',
  'AggregationType',
  'Benchmark',
  'BenchmarkType'
];

export default function ProfileRelationshipMapper({ config, onNext, onBack, initialMapping = {} }) {
  const [columns, setColumns] = useState([]);
  const [profileFields, setProfileFields] = useState(DEFAULT_PROFILE_FIELDS);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [mapping, setMapping] = useState(initialMapping);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
    loadTemplates();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let sheetColumns;
      if (config.dataSourceType === 'file' && config.uploadedFileUrl) {
        sheetColumns = await SheetsService.getUploadedFileColumns(config.uploadedFileUrl);
      } else {
        sheetColumns = await SheetsService.getSheetColumns(config.sheetUrl);
      }
      
      if (sheetColumns.length === 0) {
        throw new Error('No columns found in the data source. Please ensure it has headers.');
      }
      
      setColumns(sheetColumns);
      
      // Auto-map columns with matching names if no mapping exists
      if (Object.keys(mapping).length === 0) {
        autoMapColumns(sheetColumns, profileFields);
      }
      
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to load columns');
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    if (!config.githubRepo || !config.githubToken) {
      return;
    }

    try {
      setLoadingTemplates(true);
      const templateList = await GitHubService.listTemplates(config.githubRepo, config.githubToken);
      setTemplates(templateList);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const autoMapColumns = (cols, fields) => {
    const autoMapping = {};
    fields.forEach(field => {
      const matchingCol = cols.find(col => 
        col.toLowerCase() === field.toLowerCase() ||
        col.toLowerCase().replace(/[_\s]/g, '') === field.toLowerCase().replace(/[_\s]/g, '')
      );
      if (matchingCol) {
        autoMapping[field] = matchingCol;
      }
    });
    setMapping(autoMapping);
  };

  const handleLoadTemplate = async (templateName) => {
    if (!templateName) return;

    try {
      setSelectedTemplate(templateName);
      const { schema } = await GitHubService.getTemplate(config.githubRepo, templateName, config.githubToken);
      
      // Extract fields from the schema
      const schemaPaths = JsonLdService.extractSchemaPaths(schema);
      
      // Update profile fields to include schema paths
      const combinedFields = [...DEFAULT_PROFILE_FIELDS, ...schemaPaths.filter(p => !DEFAULT_PROFILE_FIELDS.includes(p))];
      setProfileFields(combinedFields);
      
      // Re-auto-map with new fields
      if (columns.length > 0) {
        autoMapColumns(columns, combinedFields);
      }
    } catch (err) {
      setError(`Failed to load template: ${err.message}`);
    }
  };

  const handleMappingChange = (field, column) => {
    setMapping(prev => ({
      ...prev,
      [field]: column
    }));
  };

  const handleRemoveMapping = (field) => {
    setMapping(prev => {
      const newMapping = { ...prev };
      delete newMapping[field];
      return newMapping;
    });
  };

  const handleExportMapping = () => {
    const data = JSON.stringify({ mapping }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profile-relationship-mapping.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMapping = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.mapping || typeof data.mapping !== 'object') {
          throw new Error('Invalid mapping format');
        }
        setMapping(data.mapping);
      } catch (err) {
        setError(`Failed to import mapping: ${err.message}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read mapping file');
    };
    reader.readAsText(file);
  };

  const handleNext = () => {
    // Clear any previous errors
    setError(null);
    
    // Validate that AttributeIRI is mapped (required)
    if (!mapping.AttributeIRI) {
      setError('AttributeIRI field must be mapped');
      return;
    }
    
    console.log('Calling onNext with mapping:', mapping);
    onNext(mapping);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-slate-500">Loading columns...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-red-600">Error: {error}</div>
          <div className="mt-4 text-center">
            <Button onClick={loadData}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Column Mapping</CardTitle>
            <CardDescription>
              Map data source columns to profile relationship fields
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportMapping}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" asChild>
              <label>
                <Upload className="w-4 h-4 mr-2" />
                Import
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportMapping}
                />
              </label>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Template Selection */}
          {config.githubRepo && config.githubToken && (
            <div className="space-y-2">
              <Label htmlFor="template" className="flex items-center gap-2">
                <FileCode className="w-4 h-4" />
                Load Target Schema (Optional)
              </Label>
              <Select value={selectedTemplate} onValueChange={handleLoadTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select schema template..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingTemplates ? (
                    <SelectItem value="loading" disabled>Loading...</SelectItem>
                  ) : templates.length === 0 ? (
                    <SelectItem value="none" disabled>No templates found</SelectItem>
                  ) : (
                    templates.map(t => (
                      <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Load a schema to map additional fields beyond the default profile fields
              </p>
            </div>
          )}

          {/* Column Mapping Grid */}
          <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 items-center pb-2 border-b text-sm font-medium text-slate-600">
            <div>Profile Field</div>
            <div></div>
            <div>Source Column</div>
            <div></div>
          </div>

          {profileFields.map((field) => (
            <div key={field} className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 items-center">
              <div className="px-3 py-2 bg-slate-50 rounded border border-slate-200 font-mono text-sm flex items-center gap-2">
                {field}
                {field === 'AttributeIRI' && (
                  <span className="text-xs text-red-600">*</span>
                )}
              </div>
              
              <ArrowRight className="w-4 h-4 text-slate-400" />
              
              <Select
                value={mapping[field] || ''}
                onValueChange={(value) => handleMappingChange(field, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select column..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>-- Not mapped --</SelectItem>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveMapping(field)}
                disabled={!mapping[field]}
              >
                <Trash2 className="w-4 h-4 text-slate-400" />
              </Button>
            </div>
          ))}
        </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            <strong>Note:</strong> AttributeIRI is required to match profile data with existing attribute files.
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button onClick={handleNext} size="lg">
              Next: Preview Changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}