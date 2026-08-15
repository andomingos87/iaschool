#!/usr/bin/env node

import { inspectRepository } from './lib/preflight.mjs';

const report = await inspectRepository(process.cwd());
console.log(JSON.stringify(report, null, 2));

if (!report.proposedRecipe) process.exitCode = 2;
