import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Download, Upload, Trash2 } from 'lucide-react';
import { SheetsService } from '../services/sheetsService';
import { JsonLdService } from '../services/jsonLdService';

export default function ColumnMapper({ config, onNext, onBack, initialMapping = {} }) {
  const [columns, setColumns] = useState([]);
  const [schemaPaths, setSchemaPaths] = useState([]);
  const [mapping, setMapping] = useState(initialMapping);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
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
        throw new Error('No columns found in the sheet. Please ensure the sheet has headers.');
      }
      
      const paths = JsonLdService.extractSchemaPaths(config.schema);
      
      if (paths.length === 0) {
        throw new Error('No fields found in the schema. Please check your JSON-LD schema.');
      }
      
      setColumns(sheetColumns);
      setSchemaPaths(paths);
      
      // Auto-map columns with matching names
      if (Object.keys(mapping).length === 0) {
        const autoMapping = {};
        sheetColumns.forEach(col => {
          const matchingPath = paths.find(p => 
            p.toLowerCase() === col.toLowerCase() || 
            p.split('.').pop().toLowerCase() === col.toLowerCase()
          );
          if (matchingPath) {
            autoMapping[col] = matchingPath;
          }
        });
        setMapping(autoMapping);
      }
      
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to load sheet columns');
      setLoading(false);
    }
  };

  const handleMappingChange = (column, schemaPath) => {
    setMapping(prev => ({
      ...prev,
      [column]: schemaPath
    }));
  };

  const handleRemoveMapping = (column) => {
    setMapping(prev => {
      const newMapping = { ...prev };
      delete newMapping[column];
      return newMapping;
    });
  };

  const handleExportMapping = () => {
    const data = JSON.stringify({ mapping }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.configName}-mapping.json`;
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
    onNext(mapping);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-slate-500">Loading sheet columns...</div>
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
              Map sheet columns to JSON-LD schema fields
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
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 items-center pb-2 border-b text-sm font-medium text-slate-600">
            <div>Sheet Column</div>
            <div></div>
            <div>Schema Field</div>
            <div></div>
          </div>

          {columns.map((column) => (
            <div key={column} className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 items-center">
              <div className="px-3 py-2 bg-slate-50 rounded border border-slate-200 font-mono text-sm">
                {column}
              </div>
              
              <ArrowRight className="w-4 h-4 text-slate-400" />
              
              <Select
                value={mapping[column] || ''}
                onValueChange={(value) => handleMappingChange(column, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>-- Not mapped --</SelectItem>
                  {schemaPaths.map((path) => (
                    <SelectItem key={path} value={path}>
                      {path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveMapping(column)}
                disabled={!mapping[column]}
              >
                <Trash2 className="w-4 h-4 text-slate-400" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleNext} size="lg">
            Next: Preview Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}