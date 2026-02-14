/**
 * GitHub Service Layer
 * 
 * This service encapsulates all GitHub API interactions.
 * Designed to be easily replaceable with a Python-based API in future iterations.
 * 
 * Interface:
 * - listConfigurations(repo, token): List all config files from .configs/ directory
 * - getConfiguration(repo, configName, token): Get a specific config file
 * - saveConfiguration(repo, configName, configData, token): Save config to .configs/
 * - getRepoFiles(repo, path, token): List files in a repo path
 * - createPullRequest(repo, branch, title, body, changes, token): Create PR with file changes
 * - getFileContent(repo, path, token): Get content of a file
 */

const GITHUB_API_BASE = 'https://api.github.com';
const CONFIG_DIR = '.configs';

export class GitHubService {
  /**
   * List all configuration files from the repository
   */
  static async listConfigurations(repo, token) {
    const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${CONFIG_DIR}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return []; // Directory doesn't exist yet
      }
      throw new Error(`Failed to list configurations: ${response.statusText}`);
    }

    const files = await response.json();
    return files
      .filter(f => f.name.endsWith('.json'))
      .map(f => ({
        name: f.name.replace('.json', ''),
        path: f.path,
        sha: f.sha
      }));
  }

  /**
   * Get a specific configuration file
   */
  static async getConfiguration(repo, configName, token) {
    const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${CONFIG_DIR}/${configName}.json`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get configuration: ${response.statusText}`);
    }

    const data = await response.json();
    const content = atob(data.content);
    return {
      config: JSON.parse(content),
      sha: data.sha
    };
  }

  /**
   * Save configuration to the repository
   */
  static async saveConfiguration(repo, configName, configData, token, sha = null) {
    const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${CONFIG_DIR}/${configName}.json`;
    const content = btoa(JSON.stringify(configData, null, 2));

    const body = {
      message: `Update configuration: ${configName}`,
      content: content,
      branch: 'main'
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Failed to save configuration: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get file content from repository
   */
  static async getFileContent(repo, path, token) {
    const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // File doesn't exist
      }
      throw new Error(`Failed to get file: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: atob(data.content),
      sha: data.sha
    };
  }

  /**
   * List files in a directory
   */
  static async getRepoFiles(repo, path, token) {
    const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to list files: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Create a pull request with file changes
   * 
   * @param {string} repo - Repository in format "owner/repo"
   * @param {string} title - PR title
   * @param {string} body - PR description
   * @param {Array} changes - Array of {path, content, operation: 'create'|'update'|'delete'}
   * @param {string} token - GitHub access token
   */
  static async createPullRequest(repo, title, body, changes, token) {
    // 1. Get the default branch and its latest commit SHA
    const repoUrl = `${GITHUB_API_BASE}/repos/${repo}`;
    const repoResponse = await fetch(repoUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!repoResponse.ok) {
      throw new Error(`Failed to get repository info: ${repoResponse.statusText}`);
    }

    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch;

    // 2. Get the latest commit SHA of the default branch
    const refUrl = `${GITHUB_API_BASE}/repos/${repo}/git/refs/heads/${defaultBranch}`;
    const refResponse = await fetch(refUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!refResponse.ok) {
      throw new Error(`Failed to get reference: ${refResponse.statusText}`);
    }

    const refData = await refResponse.json();
    const baseSha = refData.object.sha;

    // 3. Create a new branch
    const branchName = `sync-${Date.now()}`;
    const createBranchUrl = `${GITHUB_API_BASE}/repos/${repo}/git/refs`;
    const createBranchResponse = await fetch(createBranchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha
      })
    });

    if (!createBranchResponse.ok) {
      throw new Error(`Failed to create branch: ${createBranchResponse.statusText}`);
    }

    // 4. Apply changes to the branch
    for (const change of changes) {
      if (change.operation === 'delete') {
        // Delete file
        const deleteUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${change.path}`;
        await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Delete ${change.path}`,
            sha: change.sha,
            branch: branchName
          })
        });
      } else {
        // Create or update file
        const fileUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${change.path}`;
        const fileBody = {
          message: change.operation === 'create' ? `Create ${change.path}` : `Update ${change.path}`,
          content: btoa(change.content),
          branch: branchName
        };

        if (change.sha) {
          fileBody.sha = change.sha;
        }

        await fetch(fileUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fileBody)
        });
      }
    }

    // 5. Create pull request
    const prUrl = `${GITHUB_API_BASE}/repos/${repo}/pulls`;
    const prResponse = await fetch(prUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        body,
        head: branchName,
        base: defaultBranch
      })
    });

    if (!prResponse.ok) {
      throw new Error(`Failed to create PR: ${prResponse.statusText}`);
    }

    const prData = await prResponse.json();
    return {
      url: prData.html_url,
      number: prData.number,
      branch: branchName
    };
  }
}