console.log('from entry.mjs')
console.log(await import('./j.json'))
await import('./dep.ts')
await import('#import')
await import('#conditioned')
await import('#templated/templated')
await import('a/exported')
await import('b')
await import('c')
await import('./cjs.cjs')
