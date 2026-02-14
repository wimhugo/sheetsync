import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FileCode, Github, Sheet } from 'lucide-react';

export default function ConfigurationForm({ onNext, initialData = null }) {
  const [formData, setFormData] = useState(initialData || {
    configName: '',
    sheetUrl: '',
    githubRepo: '',
    githubToken: '',
    schema: '{\n  "@context": "https://schema.org",\n  "@type": "Thing",\n  "name": "",\n  "description": ""\n}',
    outputDir: 'data',
    indexFileName: 'index.json',
    fileNameColumn: ''
  });

  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const newErrors = {};
    
    if (!formData.configName.trim()) {
      newErrors.configName = 'Configuration name is required';
    }
    
    if (!formData.sheetUrl.trim()) {
      newErrors.sheetUrl = 'Google Sheet URL is required';
    }
    
    if (!formData.githubRepo.trim()) {
      newErrors.githubRepo = 'GitHub repository is required';
    } else if (!formData.githubRepo.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/)) {
      newErrors.githubRepo = 'Format should be: owner/repo';
    }
    
    if (!formData.githubToken.trim()) {
      newErrors.githubToken = 'GitHub token is required';
    }
    
    try {
      JSON.parse(formData.schema);
    } catch (e) {
      newErrors.schema = 'Invalid JSON schema';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onNext({
      ...formData,
      schema: JSON.parse(formData.schema)
    });
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration Setup</CardTitle>
        <CardDescription>
          Configure the source sheet, target repository, and JSON-LD schema
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="configName">Configuration Name</Label>
            <Input
              id="configName"
              value={formData.configName}
              onChange={(e) => handleChange('configName', e.target.value)}
              placeholder="e.g., products-sync"
            />
            {errors.configName && (
              <p className="text-sm text-red-600">{errors.configName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sheetUrl" className="flex items-center gap-2">
              <Sheet className="w-4 h-4" />
              Google Sheet URL
            </Label>
            <Input
              id="sheetUrl"
              value={formData.sheetUrl}
              onChange={(e) => handleChange('sheetUrl', e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            <p className="text-xs text-slate-500">
              Make sure the sheet is publicly accessible or set to "Anyone with the link can view"
            </p>
            {errors.sheetUrl && (
              <p className="text-sm text-red-600">{errors.sheetUrl}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="githubRepo" className="flex items-center gap-2">
                <Github className="w-4 h-4" />
                GitHub Repository
              </Label>
              <Input
                id="githubRepo"
                value={formData.githubRepo}
                onChange={(e) => handleChange('githubRepo', e.target.value)}
                placeholder="owner/repo"
              />
              {errors.githubRepo && (
                <p className="text-sm text-red-600">{errors.githubRepo}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="githubToken">GitHub Personal Access Token</Label>
              <Input
                id="githubToken"
                type="password"
                value={formData.githubToken}
                onChange={(e) => handleChange('githubToken', e.target.value)}
                placeholder="ghp_..."
              />
              {errors.githubToken && (
                <p className="text-sm text-red-600">{errors.githubToken}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schema" className="flex items-center gap-2">
              <FileCode className="w-4 h-4" />
              Target JSON-LD Schema
            </Label>
            <Textarea
              id="schema"
              value={formData.schema}
              onChange={(e) => handleChange('schema', e.target.value)}
              className="font-mono text-sm min-h-[200px]"
              placeholder='{"@context": "https://schema.org", "@type": "Thing", ...}'
            />
            {errors.schema && (
              <p className="text-sm text-red-600">{errors.schema}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="outputDir">Output Directory</Label>
              <Input
                id="outputDir"
                value={formData.outputDir}
                onChange={(e) => handleChange('outputDir', e.target.value)}
                placeholder="data"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="indexFileName">Index File Name</Label>
              <Input
                id="indexFileName"
                value={formData.indexFileName}
                onChange={(e) => handleChange('indexFileName', e.target.value)}
                placeholder="index.json"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fileNameColumn">File Name Column</Label>
              <Input
                id="fileNameColumn"
                value={formData.fileNameColumn}
                onChange={(e) => handleChange('fileNameColumn', e.target.value)}
                placeholder="id or name"
              />
              <p className="text-xs text-slate-500">Leave empty to use first column</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="lg">
              Next: Map Columns
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}