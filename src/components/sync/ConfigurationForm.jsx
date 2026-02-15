import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileCode, Github, Sheet, Upload, Loader2, Save } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { GitHubService } from '../services/githubService';

export default function ConfigurationForm({ onNext, initialData = null }) {
  const [formData, setFormData] = useState(initialData || {
    configName: '',
    sheetUrl: '',
    uploadedFileUrl: '',
    dataSourceType: 'sheet', // 'sheet' or 'file'
    githubRepo: '',
    githubToken: '',
    schema: '{\n  "@context": "https://schema.org",\n  "@type": "Thing",\n  "name": "",\n  "description": ""\n}',
    outputDir: 'data',
    indexFileName: 'index.json',
    fileNameColumn: ''
  });

  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['.csv', '.xlsx'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!allowedTypes.includes(fileExt)) {
      setErrors({ ...errors, uploadedFileUrl: 'Only CSV and XLSX files are supported' });
      return;
    }

    try {
      setUploading(true);
      setErrors({ ...errors, uploadedFileUrl: undefined });

      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      setFormData(prev => ({ ...prev, uploadedFileUrl: file_url }));
      setUploading(false);
    } catch (err) {
      setErrors({ ...errors, uploadedFileUrl: `Upload failed: ${err.message}` });
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const newErrors = {};
    
    if (!formData.configName.trim()) {
      newErrors.configName = 'Configuration name is required';
    }
    
    if (formData.dataSourceType === 'sheet') {
      if (!formData.sheetUrl.trim()) {
        newErrors.sheetUrl = 'Google Sheet URL is required';
      }
    } else {
      if (!formData.uploadedFileUrl) {
        newErrors.uploadedFileUrl = 'Please upload a file';
      }
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

  const loadTemplates = async () => {
    if (!formData.githubRepo || !formData.githubToken) {
      return;
    }

    try {
      setLoadingTemplates(true);
      const templateList = await GitHubService.listTemplates(formData.githubRepo, formData.githubToken);
      setTemplates(templateList);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleLoadTemplate = async (templateName) => {
    if (!templateName) return;

    try {
      const { schema } = await GitHubService.getTemplate(formData.githubRepo, templateName, formData.githubToken);
      handleChange('schema', JSON.stringify(schema, null, 2));
    } catch (err) {
      setErrors({ ...errors, schema: `Failed to load template: ${err.message}` });
    }
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    try {
      setSavingTemplate(true);
      const schema = JSON.parse(formData.schema);
      await GitHubService.saveTemplate(formData.githubRepo, newTemplateName, schema, formData.githubToken);
      setNewTemplateName('');
      await loadTemplates();
      alert('Template saved successfully!');
    } catch (err) {
      alert(`Failed to save template: ${err.message}`);
    } finally {
      setSavingTemplate(false);
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

          <Tabs value={formData.dataSourceType} onValueChange={(value) => handleChange('dataSourceType', value)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sheet">Google Sheet</TabsTrigger>
              <TabsTrigger value="file">Upload File</TabsTrigger>
            </TabsList>
            
            <TabsContent value="sheet" className="space-y-2">
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
            </TabsContent>

            <TabsContent value="file" className="space-y-2">
              <Label htmlFor="fileUpload" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload CSV or XLSX File
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="fileUpload"
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                {uploading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
              </div>
              {formData.uploadedFileUrl && (
                <p className="text-xs text-green-600">✓ File uploaded successfully</p>
              )}
              {errors.uploadedFileUrl && (
                <p className="text-sm text-red-600">{errors.uploadedFileUrl}</p>
              )}
            </TabsContent>
          </Tabs>

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
            <div className="flex items-center justify-between">
              <Label htmlFor="schema" className="flex items-center gap-2">
                <FileCode className="w-4 h-4" />
                Target JSON-LD Schema
              </Label>
              <div className="flex items-center gap-2">
                {formData.githubRepo && formData.githubToken && (
                  <>
                    <Select onValueChange={handleLoadTemplate}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Load template..." />
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={loadTemplates}
                      disabled={loadingTemplates}
                    >
                      {loadingTemplates ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Textarea
              id="schema"
              value={formData.schema}
              onChange={(e) => handleChange('schema', e.target.value)}
              className="font-mono text-sm min-h-[200px]"
              placeholder='{"@context": "https://schema.org", "@type": "Thing", ...}'
            />
            {formData.githubRepo && formData.githubToken && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Template name..."
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !newTemplateName.trim()}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {savingTemplate ? 'Saving...' : 'Save as Template'}
                </Button>
              </div>
            )}
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