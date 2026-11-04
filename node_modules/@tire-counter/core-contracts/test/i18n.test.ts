import { describe, it, expect } from 'vitest';
import es from '../src/i18n/es.json';
import en from '../src/i18n/en.json';
import ru from '../src/i18n/ru.json';
import ko from '../src/i18n/ko.json';
import zh from '../src/i18n/zh.json';

function getAllKeys(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getAllKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe('i18n Dictionary Parity Suite', () => {
  const esKeys = getAllKeys(es);

  it('test_i18n_dictionary_parity: should have 100% key parity between es and en', () => {
    const enKeys = getAllKeys(en);
    expect(enKeys).toEqual(esKeys);
  });

  it('test_i18n_dictionary_parity: should have 100% key parity between es and ru', () => {
    const ruKeys = getAllKeys(ru);
    expect(ruKeys).toEqual(esKeys);
  });

  it('test_i18n_dictionary_parity: should have 100% key parity between es and ko', () => {
    const koKeys = getAllKeys(ko);
    expect(koKeys).toEqual(esKeys);
  });

  it('test_i18n_dictionary_parity: should have 100% key parity between es and zh', () => {
    const zhKeys = getAllKeys(zh);
    expect(zhKeys).toEqual(esKeys);
  });

  it('should have all 4 required namespaces: auth, counter, vault, errors', () => {
    const namespaces = Object.keys(es);
    expect(namespaces).toContain('auth');
    expect(namespaces).toContain('counter');
    expect(namespaces).toContain('vault');
    expect(namespaces).toContain('errors');
  });
});
