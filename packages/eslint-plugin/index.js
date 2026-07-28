import { noBannerComments } from './rules/no-banner-comments.js';
import { noDocCommentBody } from './rules/no-doc-comment-body.js';
import { noContentInSinks } from './rules/no-content-in-sinks.js';
import { noLayerDirFiles } from './rules/no-layer-dir-files.js';
import { noOrmPrefixedClasses } from './rules/no-orm-prefixed-classes.js';
import { noTestDoublesInSrc } from './rules/no-test-doubles-in-src.js';
import { noSrcImportsFromTest } from './rules/no-src-imports-from-test.js';
import { filenameMatchesExport } from './rules/filename-matches-export.js';
import { maxFilesPerDomainDir } from './rules/max-files-per-domain-dir.js';

const plugin = {
  meta: { name: '@folklore/eslint-plugin', version: '0.0.0' },
  rules: {
    'no-banner-comments': noBannerComments,
    'no-doc-comment-body': noDocCommentBody,
    'no-content-in-sinks': noContentInSinks,
    'no-layer-dir-files': noLayerDirFiles,
    'no-orm-prefixed-classes': noOrmPrefixedClasses,
    'no-test-doubles-in-src': noTestDoublesInSrc,
    'no-src-imports-from-test': noSrcImportsFromTest,
    'filename-matches-export': filenameMatchesExport,
    'max-files-per-domain-dir': maxFilesPerDomainDir,
  },
};

export default plugin;
