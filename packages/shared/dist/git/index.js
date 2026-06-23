import { execSync } from 'child_process';
export function getGitInfo(projectPath) {
    try {
        const rootDir = execSync('git rev-parse --show-toplevel', {
            cwd: projectPath,
            encoding: 'utf-8',
        }).trim();
        const branch = execSync('git branch --show-current', {
            cwd: projectPath,
            encoding: 'utf-8',
        }).trim();
        const commitHash = execSync('git rev-parse HEAD', {
            cwd: projectPath,
            encoding: 'utf-8',
        }).trim().slice(0, 8);
        const status = execSync('git status --porcelain', {
            cwd: projectPath,
            encoding: 'utf-8',
        }).trim();
        return {
            branch,
            commitHash,
            isDirty: status.length > 0,
            rootDir,
        };
    }
    catch {
        return null;
    }
}
export function isGitRepository(path) {
    try {
        execSync('git rev-parse --git-dir', {
            cwd: path,
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=index.js.map