import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle2, AlertCircle, Loader2, Upload, Sheet, 
  ArrowRight, GitPullRequest, AlertTriangle, ArrowLeft, Map 
} from 'lucide-react';
import { ProfileRelationshipService } from '../components/services/profileRelationshipService';
import { GitHubService } from '../components/services/githubService';
import ProfileRelationshipMapper from '../components/sync/ProfileRelationshipMapper';

export default function ProfileRelationshipSync() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState('configure'); // configure, map, preview, success
  
  const [formData, setFormData] = useState({
    sheetUrl: '',
    uploadedFileUrl: '',
    dataSourceType: 'sheet',
    githubRepo: '',
    githubToken: '',
    outputDir: 'data',
    indexFileName: 'index.json'
  });

  const [mapping, setMapping] = useState({});
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  };

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

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleConfigureNext = (e) => {
    e.preventDefault();

    const newErrors = {};
    
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

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setStep('map');
  };

  const handleMapNext = async (columnMapping) => {
    console.log('handleMapNext called with:', columnMapping);
    setMapping(columnMapping);
    setErrors({});
    setLoading(true);

    try {
      console.log('Calling previewChanges...');
      const previewResult = await ProfileRelationshipService.previewChanges(
        formData,
        columnMapping,
        formData.githubRepo,
        formData.githubToken
      );
      
      console.log('Preview result:', previewResult);
      setPreview(previewResult);
      setStep('preview');
    } catch (err) {
      console.error('Preview error:', err);
      setErrors({ general: err.message || 'Failed to generate preview' });
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);

    try {
      const prUrl = await GitHubService.createPullRequest(
        formData.githubRepo,
        'profile-relationships-update',
        'Update attribute profiles',
        `Automated update of profile relationships\n\n- Files updated: ${preview.changes.length}\n- Rows processed: ${preview.summary.totalRows}\n- Rows skipped: ${preview.summary.rowsSkipped}`,
        preview.changes,
        formData.githubToken
      );

      setResult({
        prUrl,
        summary: preview.summary,
        warnings: preview.warnings
      });

      // Save to history
      try {
        await base44.entities.SyncHistory.create({
          configuration_name: 'Profile Relationships',
          sheet_url: formData.sheetUrl || formData.uploadedFileUrl || 'uploaded-file',
          github_repo: formData.githubRepo,
          pr_url: prUrl,
          status: 'success',
          files_updated: preview.changes.length
        });
      } catch (err) {
        console.error('Failed to save history:', err);
      }

      setStep('success');
    } catch (err) {
      setErrors({ general: `Failed to push changes: ${err.message}` });
    } finally {
      setPushing(false);
    }
  };

  const handleReset = () => {
    setStep('configure');
    setMapping({});
    setPreview(null);
    setResult(null);
    setErrors({});
  };

  const getUserRole = () => {
    if (!user) return 'viewer';
    return user.role === 'admin' ? 'editor' : 'viewer';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <Link to={createPageUrl('Sync')}>
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Main Sync
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Profile Relationship Sync
          </h1>
          <p className="text-slate-600">
            Augment existing attribute files with profile relationship data
          </p>
        </div>

        {user && (
          <div className="mb-6">
            <Badge variant="outline" className="text-sm">
              Role: {getUserRole()}
            </Badge>
          </div>
        )}

        {/* Configure Step */}
        {step === 'configure' && (
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Upload profile relationship data to augment existing attribute files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConfigureNext} className="space-y-6">
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
                      Sheet must have columns: ProfileIRI, ProfileClass, ProfileAttributeIRI, ProfileAttributeLabel, AggregationType, Benchmark, BenchmarkType, AttributeIRI
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
                    <Label htmlFor="githubRepo">GitHub Repository</Label>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="outputDir">Attribute Files Directory</Label>
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
                </div>

                {errors.general && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {errors.general}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="submit" size="lg">
                    Next: Map Columns
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Map Step */}
        {step === 'map' && (
          <>
            {loading && (
              <Card className="mb-4">
                <CardContent className="py-6">
                  <div className="flex items-center justify-center gap-3 text-slate-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generating preview...</span>
                  </div>
                </CardContent>
              </Card>
            )}
            {errors.general && (
              <Card className="mb-4">
                <CardContent className="py-4">
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {errors.general}
                  </div>
                </CardContent>
              </Card>
            )}
            {!loading && (
              <ProfileRelationshipMapper
                config={formData}
                onNext={handleMapNext}
                onBack={() => setStep('configure')}
                initialMapping={mapping}
              />
            )}
          </>
        )}

        {/* Preview Step */}
        {step === 'preview' && preview && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Changes</CardTitle>
              <CardDescription>
                Review the changes before pushing to GitHub
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-2xl font-bold text-blue-900">
                      {preview.summary.totalRows}
                    </div>
                    <div className="text-sm text-blue-700">Total Rows</div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-900">
                      {preview.summary.filesUpdated}
                    </div>
                    <div className="text-sm text-green-700">Files Updated</div>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="text-2xl font-bold text-yellow-900">
                      {preview.summary.rowsSkipped}
                    </div>
                    <div className="text-sm text-yellow-700">Rows Skipped</div>
                  </div>
                </div>

                {/* Warnings */}
                {preview.warnings.length > 0 && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div>
                        <div className="font-medium text-yellow-900">Warnings</div>
                        <div className="text-sm text-yellow-700 mt-1">
                          Some rows were skipped during processing
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-auto">
                      {preview.warnings.map((warning, idx) => (
                        <div key={idx} className="text-sm text-yellow-800 pl-8">
                          • {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files to be updated */}
                <div>
                  <div className="font-medium mb-3">Files to be Updated:</div>
                  <div className="space-y-2 max-h-96 overflow-auto">
                    {preview.changes.map((change, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded border border-slate-200">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-600" />
                          <span className="font-mono text-sm">{change.path}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {errors.general && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {errors.general}
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep('map')}>
                    Back
                  </Button>
                  <Button 
                    onClick={handlePush} 
                    disabled={pushing || getUserRole() === 'viewer' || preview.changes.length === 0}
                    size="lg"
                  >
                    {pushing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Pushing...
                      </>
                    ) : (
                      <>
                        <GitPullRequest className="w-4 h-4 mr-2" />
                        Create Pull Request
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success Step */}
        {step === 'success' && result && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">
                    Pull Request Created!
                  </h2>
                  <p className="text-slate-600">
                    Profile relationships have been added to {result.summary.filesUpdated} attribute files
                  </p>
                </div>

                {result.warnings.length > 0 && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium text-yellow-900 mb-1">
                          {result.warnings.length} row(s) skipped
                        </div>
                        <div className="text-sm text-yellow-700">
                          Some rows couldn't be matched to existing attributes
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <Button asChild size="lg" className="w-full">
                    <a href={result.prUrl} target="_blank" rel="noopener noreferrer">
                      View Pull Request
                    </a>
                  </Button>
                  <Button variant="outline" onClick={handleReset} className="w-full">
                    Start New Sync
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}