const { getAsset } = require('node:sea');
require('module').registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            const url = new URL(specifier)
            if (url.protocol === 'sea:') {
                return {
                    url: specifier,
                    shortCircuit: true
                }
            }
        } catch (e) {
            if (context.parentURL.startsWith('sea:')) {
                if (/^\.?\.\//.test(specifier)) {
                    if (specifier[0] === '/') {
                        return {
                            url: `sea:${specifier.slice(1)}`,
                            shortCircuit: true
                        }
                    }
                    // need to use a special scheme, we emulate file: to get relative specifiers
                    const fauxParent = context.parentURL.replace('sea:', 'file://')
                    const fauxUrl = new URL(specifier, fauxParent)
                    return {
                        url: fauxUrl.href.replace('file://', 'sea:'),
                        shortCircuit: true
                    }
                }
            }
            throw e
        }
    },
    load(url, context, nextLoad) {
        if (url.startsWith('sea:')) {
            return {
                format: 'commonjs',
                source: getAsset(new URL(url).pathname),
                shortCircuit: true
            }
        }
    },
})

import('sea:a/entry.mjs')
