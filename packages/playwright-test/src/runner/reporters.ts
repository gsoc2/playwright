/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import path from 'path';
import type { Reporter, TestError } from '../../types/testReporter';
import type { ConfigLoader } from '../configLoader';
import { formatError } from '../reporters/base';
import DotReporter from '../reporters/dot';
import EmptyReporter from '../reporters/empty';
import GitHubReporter from '../reporters/github';
import HtmlReporter from '../reporters/html';
import JSONReporter from '../reporters/json';
import JUnitReporter from '../reporters/junit';
import LineReporter from '../reporters/line';
import ListReporter from '../reporters/list';
import { Multiplexer } from '../reporters/multiplexer';
import type { Suite } from '../test';
import type { FullConfigInternal, ReporterDescription } from '../types';

export async function createReporter(configLoader: ConfigLoader, list: boolean) {
  const defaultReporters: {[key in BuiltInReporter]: new(arg: any) => Reporter} = {
    dot: list ? ListModeReporter : DotReporter,
    line: list ? ListModeReporter : LineReporter,
    list: list ? ListModeReporter : ListReporter,
    github: GitHubReporter,
    json: JSONReporter,
    junit: JUnitReporter,
    null: EmptyReporter,
    html: HtmlReporter,
  };
  const reporters: Reporter[] = [];
  for (const r of configLoader.fullConfig().reporter) {
    const [name, arg] = r;
    if (name in defaultReporters) {
      reporters.push(new defaultReporters[name as keyof typeof defaultReporters](arg));
    } else {
      const reporterConstructor = await configLoader.loadReporter(name);
      reporters.push(new reporterConstructor(arg));
    }
  }
  if (process.env.PW_TEST_REPORTER) {
    const reporterConstructor = await configLoader.loadReporter(process.env.PW_TEST_REPORTER);
    reporters.push(new reporterConstructor());
  }

  const someReporterPrintsToStdio = reporters.some(r => {
    const prints = r.printsToStdio ? r.printsToStdio() : true;
    return prints;
  });
  if (reporters.length && !someReporterPrintsToStdio) {
    // Add a line/dot/list-mode reporter for convenience.
    // Important to put it first, jsut in case some other reporter stalls onEnd.
    if (list)
      reporters.unshift(new ListModeReporter());
    else
      reporters.unshift(!process.env.CI ? new LineReporter({ omitFailures: true }) : new DotReporter());
  }
  return new Multiplexer(reporters);
}

export class ListModeReporter implements Reporter {
  private config!: FullConfigInternal;

  onBegin(config: FullConfigInternal, suite: Suite): void {
    this.config = config;
    // eslint-disable-next-line no-console
    console.log(`Listing tests:`);
    const tests = suite.allTests();
    const files = new Set<string>();
    for (const test of tests) {
      // root, project, file, ...describes, test
      const [, projectName, , ...titles] = test.titlePath();
      const location = `${path.relative(config.rootDir, test.location.file)}:${test.location.line}:${test.location.column}`;
      const projectTitle = projectName ? `[${projectName}] › ` : '';
      // eslint-disable-next-line no-console
      console.log(`  ${projectTitle}${location} › ${titles.join(' ')}`);
      files.add(test.location.file);
    }
    // eslint-disable-next-line no-console
    console.log(`Total: ${tests.length} ${tests.length === 1 ? 'test' : 'tests'} in ${files.size} ${files.size === 1 ? 'file' : 'files'}`);
  }

  onError(error: TestError) {
    // eslint-disable-next-line no-console
    console.error('\n' + formatError(this.config, error, false).message);
  }
}

export function toReporters(reporters: BuiltInReporter | ReporterDescription[] | undefined): ReporterDescription[] | undefined {
  if (!reporters)
    return;
  if (typeof reporters === 'string')
    return [[reporters]];
  return reporters;
}

export const builtInReporters = ['list', 'line', 'dot', 'json', 'junit', 'null', 'github', 'html'] as const;
export type BuiltInReporter = typeof builtInReporters[number];