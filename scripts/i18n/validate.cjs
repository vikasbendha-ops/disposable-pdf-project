const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_SRC = path.join(PROJECT_ROOT, 'frontend', 'src');
const TRANSLATIONS_MODULE = pathToFileURL(
  path.join(PROJECT_ROOT, 'frontend', 'src', 'i18n', 'translations.js'),
).href;

function walkFiles(directory, extensions, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, extensions, files);
      continue;
    }
    if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectTranslationKeys() {
  const files = walkFiles(FRONTEND_SRC, new Set(['.js', '.jsx']));
  const keys = new Set();
  const pattern = /\bt\(\s*['"]([^'"]+)['"]/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(content))) {
      keys.add(match[1]);
    }
  }

  return [...keys].sort();
}

function hasPath(source, dottedPath) {
  const segments = dottedPath.split('.');
  let value = source;
  for (const segment of segments) {
    value = value?.[segment];
    if (value === undefined) return false;
  }
  return true;
}

(async () => {
  const module = await import(TRANSLATIONS_MODULE);
  const translations = module.default;
  const supportedLanguages = module.PRIMARY_LANGUAGE_CODES || [];
  const keys = collectTranslationKeys();
  const failures = [];

  for (const language of supportedLanguages) {
    for (const key of keys) {
      if (!hasPath(translations[language], key)) {
        failures.push(`${language}: ${key}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('Missing translations detected:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${keys.length} translation keys across ${supportedLanguages.length} supported languages.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
