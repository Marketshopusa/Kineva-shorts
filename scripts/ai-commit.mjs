import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

// Parse .env.local for ANTHROPIC_API_KEY
const envPath = path.join(process.cwd(), '.env.local');
let apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^ANTHROPIC_API_KEY=(.*)$/m);
  if (match) {
    apiKey = match[1].trim();
  }
}

if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY is not defined in .env.local or environment.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

async function autoCommit() {
  try {
    // Check if there are any changes first
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    if (!status.trim()) {
      return false; // No changes
    }

    console.log("\n[" + new Date().toLocaleTimeString() + "] Changes detected! Staging changes (git add .)...");
    execSync('git add .', { stdio: 'inherit' });

    // Get the diff of staged changes
    const diff = execSync('git diff --cached', { encoding: 'utf-8' });

    if (!diff.trim()) {
      return false;
    }

    console.log('Analyzing changes with Claude to generate a commit message...');
    
    const prompt = `You are a helpful assistant that generates git commit messages.
    Please generate a concise, conventional commit message based on the below git diff.
    Return ONLY the actual commit message text (e.g., "feat: add user login component"). Do not include any quotes, markdown formatting, or introductory text.

    Diff:
    ${diff.slice(0, 10000)}`; // Truncate just in case it's massive

    const models = [
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20240620',
      'claude-3-sonnet-20240229',
      'claude-3-opus-20240229',
      'claude-haiku-4-5-20251001',
      'claude-2.1'
    ];
    
    let commitMessage = null;
    
    for (const modelName of models) {
      try {
        const response = await anthropic.messages.create({
          model: modelName,
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }]
        });
        commitMessage = response.content[0].text.trim();
        break; // Success
      } catch (err) {
        if (err.status === 404) {
          console.log(`[Warning] Model ${modelName} not found, trying next...`);
        } else {
          throw err;
        }
      }
    }

    if (!commitMessage) {
      throw new Error("All Claude models failed or returned 404.");
    }

    console.log(`Commit message generated: "${commitMessage}"`);
    
    // Commit
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    
    console.log('✨ Successfully committed!');
    return true;
  } catch (error) {
    // If it's a git error, don't spam the console too much, just show the message
    console.error('Agent encountered an error:', error.message || error);
    return false;
  }
}

async function main() {
  const isWatchMode = process.argv.includes('--watch');

  if (isWatchMode) {
    console.log("👀 AI Auto-Commit Agent is running in the background.");
    console.log("It will check for changes every 30 seconds and commit automatically.\n");
    
    // Initial check
    await autoCommit();
    
    // Check every 30 seconds
    setInterval(async () => {
      await autoCommit();
    }, 30000);
  } else {
    // Single run mode
    const committed = await autoCommit();
    if (!committed) {
      console.log('No changes to commit.');
    }
  }
}

main();
