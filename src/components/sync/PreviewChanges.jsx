import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Edit, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { SheetsService } from '../services/sheetsService';
import { JsonLdService } from '../services/jsonLdService';
import { GitHubService } from '../services/githubService';

export default function PreviewChanges({ config, mapping, onBack, onPush, userRole }) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    generatePreview();
  }, []);

  const generatePreview = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Read sheet data
      let rows;
      if (config.dataSourceType === 'file' && config.uploadedFileUrl) {
        rows = await SheetsService.readUploadedFile(config.uploadedFileUrl);
      } else {
        rows = await SheetsService.readSheet(config.sheetUrl);
      }

      if (!rows || rows.length === 0) {
        throw new Error('No data found in the sheet. Please add some rows.');
      }

      // 2. Generate JSON-LD files
      const generatedFiles = JsonLdService.generateFiles(rows, config.schema, mapping, {
        fileNameColumn: config.fileNameColumn,
        outputDir: config.outputDir
      });

      if (generatedFiles.length === 0) {
        throw new Error('No valid rows to sync. Please check your sheet data.');
      }

      // 3. Generate index file
      const indexFile = JsonLdService.generateIndexFile(generatedFiles, {
        indexFileName: config.indexFileName
      });

      // 4. Get existing files from GitHub
      const existingFiles = await GitHubService.getRepoFiles(
        config.githubRepo,
        config.outputDir,
        config.githubToken
      );

      const existingFileNames = new Set(existingFiles.map(f => f.name));

      // 5. Determine changes
      const changesList = [];

      // Add generated files
      for (const file of generatedFiles) {
        const filePath = `${config.outputDir}/${file.fileName}`;
        
        if (existingFileNames.has(file.fileName)) {
          // Check if content differs
          const existing = await GitHubService.getFileContent(
            config.githubRepo,
            filePath,
            config.githubToken
          );
          
          if (existing && existing.content !== file.content) {
            changesList.push({
              path: filePath,
              operation: 'update',
              content: file.content,
              sha: existing.sha
            });
          }
        } else {
          changesList.push({
            path: filePath,
            operation: 'create',
            content: file.content
          });
        }

        existingFileNames.delete(file.fileName);
      }

      // Add index file
      const indexPath = `${config.outputDir}/${config.indexFileName}`;
      const existingIndex = await GitHubService.getFileContent(
        config.githubRepo,
        indexPath,
        config.githubToken
      );

      if (existingIndex) {
        if (existingIndex.content !== indexFile.content) {
          changesList.push({
            path: indexPath,
            operation: 'update',
            content: indexFile.content,
            sha: existingIndex.sha
          });
        }
      } else {
        changesList.push({
          path: indexPath,
          operation: 'create',
          content: indexFile.content
        });
      }

      // Files to delete (exist in GitHub but not in sheet)
      for (const fileName of existingFileNames) {
        if (fileName !== config.indexFileName) {
          const filePath = `${config.outputDir}/${fileName}`;
          const fileData = await GitHubService.getFileContent(
            config.githubRepo,
            filePath,
            config.githubToken
          );
          
          changesList.push({
            path: filePath,
            operation: 'delete',
            sha: fileData.sha
          });
        }
      }

      setChanges(changesList);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to generate preview');
      setLoading(false);
      console.error('Preview generation error:', err);
    }
  };

  const handlePush = async () => {
    if (changes.length === 0) {
      setError('No changes to push');
      return;
    }

    try {
      setPushing(true);
      setError(null);

      const title = `Sync: ${config.configName}`;
      const body = `
Automated sync from Google Sheets to JSON-LD files.

**Summary:**
- ${changes.filter(c => c.operation === 'create').length} files created
- ${changes.filter(c => c.operation === 'update').length} files updated
- ${changes.filter(c => c.operation === 'delete').length} files deleted

**Configuration:** ${config.configName}
**Sheet:** ${config.sheetUrl}
      `.trim();

      const pr = await GitHubService.createPullRequest(
        config.githubRepo,
        title,
        body,
        changes,
        config.githubToken
      );

      setPushing(false);
      onPush({
        prUrl: pr.url,
        changes: {
          created: changes.filter(c => c.operation === 'create').length,
          updated: changes.filter(c => c.operation === 'update').length,
          deleted: changes.filter(c => c.operation === 'delete').length
        }
      });
    } catch (err) {
      setPushing(false);
      setError(`Failed to create pull request: ${err.message}`);
      console.error('Push error:', err);
    }
  };

  const getOperationIcon = (operation) => {
    switch (operation) {
      case 'create':
        return <Plus className="w-4 h-4" />;
      case 'update':
        return <Edit className="w-4 h-4" />;
      case 'delete':
        return <Trash2 className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getOperationBadge = (operation) => {
    const variants = {
      create: 'bg-green-100 text-green-800 border-green-200',
      update: 'bg-blue-100 text-blue-800 border-blue-200',
      delete: 'bg-red-100 text-red-800 border-red-200'
    };

    return (
      <Badge className={`${variants[operation]} border flex items-center gap-1 w-20 justify-center`}>
        {getOperationIcon(operation)}
        {operation}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-slate-400" />
            <div className="text-slate-500">Generating preview...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && loading === false && changes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="max-w-md mx-auto">
            <div className="text-center text-red-600 mb-4">
              <div className="font-semibold mb-2">Error Generating Preview</div>
              <div className="text-sm">{error}</div>
            </div>
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={onBack} variant="outline">Back to Mapping</Button>
              <Button onClick={generatePreview}>Retry</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canPush = userRole !== 'viewer';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview Changes</CardTitle>
        <CardDescription>
          Review the changes that will be pushed to GitHub
        </CardDescription>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <div className="text-lg font-medium text-slate-700">No changes detected</div>
            <div className="text-sm">The repository is already up to date with the sheet</div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr] gap-4 pb-2 border-b text-sm font-medium text-slate-600">
              <div>Action</div>
              <div>File Path</div>
            </div>

            {changes.map((change, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[auto_1fr] gap-4 items-center py-2 hover:bg-slate-50 rounded px-2"
              >
                {getOperationBadge(change.operation)}
                <div className="font-mono text-sm text-slate-700">{change.path}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-sm font-medium mb-2">Summary</div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-green-600 font-medium">
                {changes.filter(c => c.operation === 'create').length}
              </span>{' '}
              files to create
            </div>
            <div>
              <span className="text-blue-600 font-medium">
                {changes.filter(c => c.operation === 'update').length}
              </span>{' '}
              files to update
            </div>
            <div>
              <span className="text-red-600 font-medium">
                {changes.filter(c => c.operation === 'delete').length}
              </span>{' '}
              files to delete
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <div className="font-medium mb-1">Error:</div>
            {error}
          </div>
        )}

        {!canPush && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            You don't have permission to push changes. Only editors can create pull requests.
          </div>
        )}

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={onBack} disabled={pushing}>
            Back
          </Button>
          <Button
            onClick={handlePush}
            size="lg"
            disabled={pushing || changes.length === 0 || !canPush}
          >
            {pushing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating Pull Request...
              </>
            ) : (
              'Push to GitHub'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}