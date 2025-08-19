#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import inquirer from 'inquirer';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { promises as fsp } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class BoilerplateRunner {
  constructor(config) {
    this.config = config;
    this.variables = { ...config.config?.variables };
    this.phaseResults = {};
  }

  async run() {
    try {
      await this.collectVariables();
      await this.executeWorkflow();
      this.showCompletionMessage();
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  }

  async collectVariables() {
    const prompts = this.config.config?.prompts || [];
    const answers = await inquirer.prompt(prompts.map(prompt => ({
      type: prompt.type,
      name: prompt.name,
      message: prompt.message,
      choices: prompt.options,
      default: this.variables[prompt.name],
      validate: prompt.validate ? input => this.validateInput(input, prompt.validate) : undefined
    })));

    this.variables = { ...this.variables, ...answers };
  }

  validateInput(input, validation) {
    if (validation.regex && !new RegExp(validation.regex).test(input)) {
      return validation.error || 'Invalid input';
    }
    return true;
  }

  async executeWorkflow() {
    for (const phase of this.config.workflow.phases) {
      // Check if phase should be skipped based on conditions
      if (phase.when && !this.evaluateCondition(phase.when)) {
        console.log(`\n⏭️  Skipping ${phase.title} (condition not met)`);
        continue;
      }

      console.log(`\n${phase.title}`);
      if (phase.description) console.log(phase.description);

      for (const step of phase.steps) {
        // Check if step should be skipped based on conditions
        if (step.when && !this.evaluateCondition(step.when)) {
          console.log(`\n  ⏭️  Skipping ${step.title} (condition not met)`);
          continue;
        }

        console.log(`\n  → ${step.title}`);
        if (step.description) console.log(`    ${step.description}`);

        try {
          await this.executeStep(step);
          await this.validateStep(step);
          console.log(`  ✅ Completed`);
        } catch (error) {
          console.error(`  ❌ Failed: ${error.message}`);
          throw error;
        }
      }
    }
  }

  evaluateCondition(condition) {
    // Use the same condition evaluator as templates
    return this.evaluateTemplateCondition(condition.replace(/\{\{|\}\}/g, ''));
  }

  async executeStep(step) {
    switch (step.type) {
      case 'command':
        await this.runCommand(step);
        break;
      case 'directory':
        await this.handleDirectory(step);
        break;
      case 'file':
        await this.handleFile(step);
        break;
      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  }

  async runCommand(step) {
    const cmd = this.resolveVariables(step.cmd);
    const cwd = step.cwd ? this.resolveVariables(step.cwd) : process.cwd();
    const interactions = step.interactions || [];

    console.log(`    Running: ${cmd}`);
    if (cwd !== process.cwd()) {
      console.log(`    Working directory: ${cwd}`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, {
        shell: true,
        cwd: cwd,
        stdio: step.haveInteraction ? ['pipe', 'pipe', 'inherit'] : [0, 1, 2]
      });

      if (step.haveInteraction) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });

        child.stdout.on('data', (data) => {
          const output = data.toString();
          process.stdout.write(output); // Show output to user

          const interaction = interactions.find(i => output.includes(i.question));
          if (interaction) {
            child.stdin.write(`${interaction.answer}\n`);
          }
        });

        rl.on('line', (input) => {
          child.stdin.write(`${input}\n`);
        });

        child.on('close', () => rl.close());
      }

      child.on('error', reject);
      child.on('close', (code) => {
        code === 0 ? resolve() : reject(new Error(`Command exited with code ${code}`));
      });
    });
  }

  async handleDirectory(step) {
    const paths = step.paths.map(p => this.resolveVariables(p));

    for (const dirPath of paths) {
      try {
        await fsp.mkdir(dirPath, { recursive: true });
        console.log(`    ✅ Created directory: ${dirPath}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
        }
        console.log(`    ℹ️  Directory already exists: ${dirPath}`);
      }
    }
  }

  async handleFile(step) {
    const resolvedPath = this.resolveVariables(step.path);

    // Ensure the directory exists before creating the file
    const dir = path.dirname(resolvedPath);
    try {
      await fsp.mkdir(dir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create directory ${dir}: ${error.message}`);
      }
    }

    switch (step.action) {
      case 'create':
        await this.createFile(step, resolvedPath);
        break;
      case 'edit':
        await this.editFile(step, resolvedPath);
        break;
      case 'delete':
        await this.deleteFile(resolvedPath);
        break;
      case 'move':
        await this.moveFile(step);
        break;
      default:
        throw new Error(`Unsupported file action: ${step.action}`);
    }
  }

  async createFile(step, filePath) {
    try {
      // Check if file already exists
      await fsp.access(filePath);
      console.log(`    ⚠️  File already exists: ${filePath}`);

      // Ask user what to do
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: `File ${path.basename(filePath)} already exists. What would you like to do?`,
        choices: [
          { name: 'Overwrite', value: 'overwrite' },
          { name: 'Skip', value: 'skip' },
          { name: 'Backup and overwrite', value: 'backup' }
        ]
      }]);

      if (action === 'skip') {
        console.log(`    ⏭️  Skipped file: ${filePath}`);
        return;
      }

      if (action === 'backup') {
        const backupPath = `${filePath}.backup.${Date.now()}`;
        await fsp.copyFile(filePath, backupPath);
        console.log(`    💾 Backed up to: ${backupPath}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, which is expected for create operation
    }

    const content = this.resolveVariables(step.content || '');
    await fsp.writeFile(filePath, content, 'utf8');
    console.log(`    ✅ Created file: ${filePath}`);
  }

  async editFile(step, filePath) {
    let existingContent = '';
    try {
      existingContent = await fsp.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`    ⚠️  File doesn't exist, creating new: ${filePath}`);
      } else {
        throw error;
      }
    }

    let newContent = this.resolveVariables(step.content || '');

    // Handle special replacements
    newContent = newContent
      .replace('{{file-content}}', existingContent)
      .replace(/@import\s+(.+?);/g, 'import $1 from \'$1\';');

    // Handle find/replace operations
    if (step.find && step.replace) {
      const findPattern = this.resolveVariables(step.find);
      const replaceWith = this.resolveVariables(step.replace);
      newContent = existingContent.replace(new RegExp(findPattern, 'g'), replaceWith);
    }

    await fsp.writeFile(filePath, newContent, 'utf8');
    console.log(`    ✅ Updated file: ${filePath}`);
  }

  async deleteFile(filePath) {
    try {
      await fsp.unlink(filePath);
      console.log(`    ✅ Deleted file: ${filePath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`    ℹ️  File doesn't exist: ${filePath}`);
      } else {
        throw error;
      }
    }
  }

  async moveFile(step) {
    const from = this.resolveVariables(step.path.from);
    const to = this.resolveVariables(step.path.to);

    // Ensure destination directory exists
    await fsp.mkdir(path.dirname(to), { recursive: true });

    try {
      await fsp.rename(from, to);
      console.log(`    ✅ Moved file: ${from} → ${to}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Source file does not exist: ${from}`);
      }
      throw error;
    }
  }

  async validateStep(step) {
    if (!step.validate) return;

    const validation = step.validate;
    const filePath = this.resolveVariables(validation.path);

    switch (validation.test) {
      case 'exists':
        try {
          await fsp.access(filePath);
          console.log(`    ✅ Validation passed: ${filePath} exists`);
        } catch {
          throw new Error(`Validation failed: ${filePath} does not exist`);
        }
        break;
      case 'contains':
        try {
          const content = await fsp.readFile(filePath, 'utf8');
          const searchText = this.resolveVariables(validation.text);
          if (!content.includes(searchText)) {
            throw new Error(`Validation failed: ${filePath} does not contain "${searchText}"`);
          }
          console.log(`    ✅ Validation passed: ${filePath} contains expected content`);
        } catch (error) {
          if (error.message.startsWith('Validation failed:')) {
            throw error;
          }
          throw new Error(`Validation failed: Could not read ${filePath}`);
        }
        break;
      default:
        console.log(`    ⚠️  Unknown validation test: ${validation.test}`);
    }
  }

  showCompletionMessage() {
    const message = this.config.afterPhases?.message || this.config.afterPhases?.massage;
    if (message) {
      console.log(`\n${this.resolveVariables(message)}`);
    } else {
      console.log(`\n🎉 Successfully completed boilerplate setup for ${this.variables.project_name}!`);
      console.log(`📁 Project created at: ${path.resolve(this.variables.project_name)}`);
      console.log(`\n📋 Next steps:`);
      console.log(`   cd ${this.variables.project_name}`);
      console.log(`   npm run dev`);
    }
  }

  resolveVariables(str) {
    if (!str) return str;

    // First, handle conditional blocks ({{#if}})
    str = this.processConditionalBlocks(str);

    // Then handle simple variable replacements
    return str.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      const value = this.variables[varName];
      if (value === undefined) {
        console.warn(`⚠️  Warning: Variable {{${varName}}} not found`);
        return `{{${varName}}}`;
      }
      return value;
    });
  }

  processConditionalBlocks(content) {
    // Handle {{#if condition}} blocks
    const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

    return content.replace(ifRegex, (match, condition, blockContent) => {
      if (this.evaluateTemplateCondition(condition.trim())) {
        return blockContent;
      }
      return '';
    });
  }

  evaluateTemplateCondition(condition) {
    // Handle different condition formats

    // Format: variable == 'value'
    let match = condition.match(/^(\w+)\s*==\s*'([^']+)'$/);
    if (match) {
      const [, varName, expectedValue] = match;
      return this.variables[varName] === expectedValue;
    }

    // Format: variable == "value"
    match = condition.match(/^(\w+)\s*==\s*"([^"]+)"$/);
    if (match) {
      const [, varName, expectedValue] = match;
      return this.variables[varName] === expectedValue;
    }

    // Format: variable (truthy check)
    match = condition.match(/^(\w+)$/);
    if (match) {
      const varName = match[1];
      const value = this.variables[varName];
      return Boolean(value && value !== 'none' && value !== 'false');
    }

    // Format: !variable (falsy check)
    match = condition.match(/^!(\w+)$/);
    if (match) {
      const varName = match[1];
      const value = this.variables[varName];
      return !Boolean(value && value !== 'none' && value !== 'false');
    }

    console.warn(`⚠️  Warning: Unsupported condition format: ${condition}`);
    return false;
  }
}

// CLI Execution
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Usage: node boilhub.js <path-to-boilerplate.yaml>');
  console.error('📝 Example: node boilhub.js react-boilerplate.yaml');
  process.exit(1);
}

const yamlPath = path.resolve(args[0]);
try {
  console.log(`📖 Loading boilerplate from: ${yamlPath}`);
  const fileContents = fs.readFileSync(yamlPath, 'utf8');
  const config = yaml.load(fileContents);

  console.log(`🚀 Starting ${config.meta?.name || 'Boilerplate'} setup...`);

  const runner = new BoilerplateRunner(config);
  await runner.run();
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`❌ Error: YAML file not found: ${yamlPath}`);
  } else {
    console.error(`❌ Error loading YAML file: ${error.message}`);
  }
  process.exit(1);
}