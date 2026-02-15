import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { GitHubService } from '../services/githubService';

export default function ConfigurationLoader({ onLoad, onCreateNew }) {
  const [githubRepo, setGithubRepo] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [configurations, setConfigurations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(true);

  const handleLoadConfigurations = async () => {
    if (!githubRepo || !githubToken) {
      setError('Please provide both repository and token');
      return;
    }

    if (!githubRepo.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/)) {
      setError('Invalid repository format. Use: owner/repo');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const configs = await GitHubService.listConfigurations(githubRepo, githubToken);
      setConfigurations(configs);
      setShowForm(false);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to load configurations');
      setLoading(false);
      console.error('Configuration loading error:', err);
    }
  };

  const handleSelectConfiguration = async (configName) => {
    console.log('Loading configuration:', configName);
    try {
      setLoading(true);
      setError(null);
      
      const { config } = await GitHubService.getConfiguration(githubRepo, configName, githubToken);
      console.log('Loaded config data:', config);
      
      if ((!config.sheetUrl && !config.uploadedFileUrl) || !config.schema) {
        console.error('Config validation failed:', { 
          hasSheetUrl: !!config.sheetUrl, 
          hasUploadedFileUrl: !!config.uploadedFileUrl, 
          hasSchema: !!config.schema 
        });
        throw new Error('Configuration is missing required fields (sheetUrl or uploadedFileUrl, and schema)');
      }

      // Ensure dataSourceType is set correctly
      if (!config.dataSourceType) {
        config.dataSourceType = config.uploadedFileUrl ? 'file' : 'sheet';
      }
      
      const loadedConfig = {
        ...config,
        githubRepo,
        githubToken,
        configName
      };
      
      console.log('Calling onLoad with:', loadedConfig);
      onLoad(loadedConfig);
      setLoading(false);
    } catch (err) {
      console.error('Configuration selection error:', err);
      setError(`Failed to load configuration: ${err.message}`);
      setLoading(false);
    }
  };

  if (showForm) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Load Configuration</CardTitle>
          <CardDescription>
            Enter your GitHub repository details to load saved configurations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repo">GitHub Repository</Label>
              <Input
                id="repo"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="owner/repo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">GitHub Personal Access Token</Label>
              <Input
                id="token"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleLoadConfigurations} disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load Configurations'
                )}
              </Button>
              <Button variant="outline" onClick={onCreateNew}>
                Create New
              </Button>
            </div>
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
            <CardTitle>Select Configuration</CardTitle>
            <CardDescription>
              Choose a configuration to load or create a new one
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
        
        {loading && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading configuration...
          </div>
        )}
        
        {configurations.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <div className="text-slate-600 mb-4">No configurations found</div>
            <Button onClick={onCreateNew}>Create First Configuration</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {configurations.map((config) => (
              <button
                key={config.name}
                onClick={() => handleSelectConfiguration(config.name)}
                className="w-full p-4 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                disabled={loading}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-slate-400" />
                  <div className="font-medium">{config.name}</div>
                </div>
              </button>
            ))}
            
            <Button variant="outline" onClick={onCreateNew} className="w-full mt-4">
              Create New Configuration
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}