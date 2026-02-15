import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Settings, Map, Eye, Send } from 'lucide-react';
import ConfigurationLoader from '../components/sync/ConfigurationLoader';
import ConfigurationForm from '../components/sync/ConfigurationForm';
import ColumnMapper from '../components/sync/ColumnMapper';
import PreviewChanges from '../components/sync/PreviewChanges';
import { GitHubService } from '../components/services/githubService';

export default function SyncPage() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState('load'); // load, configure, map, preview, success
  const [config, setConfig] = useState(null);
  const [mapping, setMapping] = useState({});
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

  const handleLoadConfiguration = (loadedConfig, githubRepo, githubToken) => {
    // Store credentials so user doesn't need to enter them again
    setConfig({
      ...loadedConfig,
      githubRepo,
      githubToken
    });
    setMapping(loadedConfig.mapping || {});
    setStep('configure');
  };

  const handleCreateNew = () => {
    setConfig(null);
    setMapping({});
    setStep('configure');
  };

  const handleConfigureNext = (formData) => {
    setConfig(formData);
    setStep('map');
  };

  const handleMapNext = async (columnMapping) => {
    setMapping(columnMapping);

    // Validate mapping has at least one field mapped
    if (Object.keys(columnMapping).length === 0) {
      alert('Please map at least one column to a schema field before proceeding.');
      return;
    }

    // Save configuration to GitHub
    try {
      const configData = {
        configName: config.configName,
        sheetUrl: config.sheetUrl,
        uploadedFileUrl: config.uploadedFileUrl,
        dataSourceType: config.dataSourceType,
        githubRepo: config.githubRepo,
        schema: config.schema,
        outputDir: config.outputDir,
        indexFileName: config.indexFileName,
        fileNameColumn: config.fileNameColumn,
        mapping: columnMapping,
        lastModified: new Date().toISOString()
      };

      // Check if configuration already exists to get its SHA
      let existingSha = null;
      try {
        const existing = await GitHubService.getConfiguration(
          config.githubRepo,
          config.configName,
          config.githubToken
        );
        existingSha = existing.sha;
      } catch (err) {
        // Configuration doesn't exist yet, that's fine
      }

      await GitHubService.saveConfiguration(
        config.githubRepo,
        config.configName,
        configData,
        config.githubToken,
        existingSha
      );
    } catch (err) {
      console.error('Failed to save configuration:', err);
      const shouldContinue = window.confirm(
        `Warning: Configuration could not be saved to GitHub:\n${err.message}\n\nDo you want to continue anyway?`
      );
      if (!shouldContinue) {
        return;
      }
    }

    setStep('preview');
  };

  const handlePushComplete = async (pushResult) => {
    setResult(pushResult);

    // Save sync history
    try {
      await base44.entities.SyncHistory.create({
        configuration_name: config.configName,
        sheet_url: config.sheetUrl || config.uploadedFileUrl || 'uploaded-file',
        github_repo: config.githubRepo,
        pr_url: pushResult.prUrl,
        status: 'success',
        files_created: pushResult.changes.created,
        files_updated: pushResult.changes.updated,
        files_deleted: pushResult.changes.deleted
      });
    } catch (err) {
      console.error('Failed to save sync history:', err);
      // Non-critical error, continue anyway
    }

    setStep('success');
  };

  const handleReset = () => {
    setStep('load');
    setConfig(null);
    setMapping({});
    setResult(null);
  };

  const handleQuickSync = () => {
    setStep('preview');
  };

  const getUserRole = () => {
    if (!user) return 'viewer';
    return user.role === 'admin' ? 'editor' : 'viewer';
  };

  const steps = [
    { id: 'load', label: 'Load', icon: Settings },
    { id: 'configure', label: 'Configure', icon: Settings },
    { id: 'map', label: 'Map', icon: Map },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'success', label: 'Push', icon: Send }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Sheet to GitHub JSON-LD Sync
          </h1>
          <p className="text-slate-600">
            Sync Google Sheets data to GitHub repository as JSON-LD files
          </p>
        </div>

        {/* User Role Badge */}
        {user && (
          <div className="mb-6">
            <Badge variant="outline" className="text-sm">
              Role: {getUserRole()}
            </Badge>
          </div>
        )}

        {/* Progress Steps */}
        {step !== 'load' && step !== 'success' && (
          <div className="mb-8">
            <div className="flex items-center justify-between max-w-2xl mx-auto">
              {steps.slice(1, -1).map((s, idx) => {
                const stepIdx = idx + 1;
                const isActive = stepIdx === currentStepIndex;
                const isComplete = stepIdx < currentStepIndex;
                const Icon = s.icon;

                return (
                  <React.Fragment key={s.id}>
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                          isActive
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : isComplete
                            ? 'border-green-500 bg-green-500 text-white'
                            : 'border-slate-300 bg-white text-slate-400'
                        }`}
                      >
                        {isComplete ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : (
                          <Icon className="w-6 h-6" />
                        )}
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-600">
                        {s.label}
                      </div>
                    </div>
                    {idx < steps.length - 3 && (
                      <div
                        className={`flex-1 h-0.5 ${
                          stepIdx < currentStepIndex ? 'bg-green-500' : 'bg-slate-300'
                        }`}
                        style={{ margin: '0 1rem', marginBottom: '2rem' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="max-w-4xl mx-auto">
          {step === 'load' && (
            <ConfigurationLoader
              onLoad={handleLoadConfiguration}
              onCreateNew={handleCreateNew}
            />
          )}

          {step === 'configure' && (
            <ConfigurationForm
              onNext={handleConfigureNext}
              initialData={config}
            />
          )}

          {step === 'map' && (
            <ColumnMapper
              config={config}
              onNext={handleMapNext}
              onBack={() => setStep('configure')}
              initialMapping={mapping}
            />
          )}

          {step === 'preview' && (
            <PreviewChanges
              config={config}
              mapping={mapping}
              onBack={() => setStep('map')}
              onPush={handlePushComplete}
              userRole={getUserRole()}
            />
          )}

          {step === 'success' && result && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Pull Request Created!
              </h2>
              <p className="text-slate-600 mb-6">
                Your changes have been pushed to GitHub
              </p>

              <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-green-600 font-medium">
                      {result.changes.created}
                    </span>{' '}
                    created
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">
                      {result.changes.updated}
                    </span>{' '}
                    updated
                  </div>
                  <div>
                    <span className="text-red-600 font-medium">
                      {result.changes.deleted}
                    </span>{' '}
                    deleted
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button asChild size="lg" className="w-full">
                  <a href={result.prUrl} target="_blank" rel="noopener noreferrer">
                    View Pull Request
                  </a>
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleQuickSync} className="flex-1">
                    Quick Sync Again
                  </Button>
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    Start New Sync
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}