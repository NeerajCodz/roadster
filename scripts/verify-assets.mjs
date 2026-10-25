import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/assets/reference/', import.meta.url));

try {
  const manifest = JSON.parse(await readFile(resolve(root, 'asset-manifest.json'), 'utf8'));
  assert.equal(manifest.files.length, 29, 'Expected the complete 29-file reference inventory');
  const seen = new Set();
  let bytes = 0;
  let glbs = 0;

  for (const entry of manifest.files) {
    assert.equal(typeof entry.path, 'string', 'Each asset needs a relative path');
    assert.ok(!isAbsolute(entry.path), `Absolute asset path: ${entry.path}`);
    const path = resolve(root, entry.path);
    assert.ok(
      path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`),
      `Asset outside reference directory: ${entry.path}`,
    );
    assert.ok(!seen.has(path), `Duplicate asset path: ${entry.path}`);
    seen.add(path);

    const data = await readFile(path);
    assert.equal(data.length, entry.bytes, `${entry.path}: byte length differs`);
    assert.equal(
      createHash('sha256').update(data).digest('hex'),
      entry.sha256,
      `${entry.path}: SHA-256 differs`,
    );
    bytes += data.length;

    if (entry.path.endsWith('.glb')) {
      assert.ok(data.length >= 20, `${entry.path}: incomplete GLB header`);
      assert.equal(data.readUInt32LE(0), 0x46546c67, `${entry.path}: GLB magic differs`);
      assert.equal(data.readUInt32LE(4), 2, `${entry.path}: expected glTF version 2`);
      assert.equal(data.readUInt32LE(8), data.length, `${entry.path}: GLB declared length differs`);
      assert.equal(
        data.readUInt32LE(16),
        0x4e4f534a,
        `${entry.path}: first GLB chunk must be JSON`,
      );
      glbs++;
    }
  }

  assert.equal(glbs, 2, 'Expected the original player and traffic GLBs');
  console.log(
    `Verified ${seen.size} reference assets (${bytes.toLocaleString('en-US')} bytes); ${glbs} GLB v2 headers valid.`,
  );
} catch (error) {
  console.error(`Asset verification failed: ${error.message}`);
  process.exitCode = 1;
}
