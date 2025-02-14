const { getAsset: $getAsset } = require('node:sea');
const pkgCache = new Map()
let getAsset = (s, e) => {
    try {
        return $getAsset(s, e)
    } catch (e) {
        return null
    }
}
require('module').registerHooks({
    resolve(specifier, context, nextResolve) {
        // console.trace({resolve:{specifier,context}})
        let nullByteIndex = specifier.indexOf('%00')
        if (nullByteIndex !== -1) {
            // this was intercepted from require()
            // sync require(esm) complexity not hookable
            specifier = specifier.slice(nullByteIndex + 3)
        }
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
                            url: `sea:file:/${specifier.slice(1)}`,
                            shortCircuit: true
                        }
                    }
                    // need to use a special scheme, we emulate file: to get relative specifiers
                    const fauxParent = context.parentURL.replace('sea:', '')
                    const fauxUrl = new URL(specifier, fauxParent)
                    return {
                        url: `sea:${fauxUrl.href}`,
                        shortCircuit: true
                    }
                } else {
                    let prevSearch = new URL(context.parentURL.replace('sea:', ''));
                    let searchURL = new URL('./package.json', prevSearch)
                    while (searchURL.href !== prevSearch.href) {
                        // console.error('searching', searchURL.href)
                        prevSearch = searchURL;
                        const searchHREF = searchURL.href
                        const asset = getAsset(`${searchHREF}`, 'utf-8')
                        if (asset) {
                            const pkgData = JSON.parse(asset);
                            const pkgName = pkgData.name
                            pkgCache.set(searchHREF, pkgData)
                            function resolvePkgImports(specifier, searchURL, pkgData, imports, isRoot, expand) {
                                if (Array.isArray(imports)) {
                                    return resolvePkgImports(imports[0], searchURL, pkgData, isRoot)
                                }
                                if (isRoot) {
                                    if (typeof imports === 'object' && imports && Object.hasOwn(imports, specifier)) {
                                        const value = imports[specifier]
                                        return resolvePkgImports(specifier, searchURL, pkgData, value, false)
                                    }
                                    if (specifier === '.') {
                                        if (typeof pkgData?.main === 'string') {
                                            let main = pkgData.main
                                            if (/^\.\//.test(main) !== true) {
                                                main = './' + main
                                            }
                                            return new URL(main, searchURL).href
                                        }
                                    }
                                    if (typeof imports === 'object' && imports) {
                                        for (const key of Object.keys(imports)) {
                                            const tmplParts = key.split('*')
                                            if (tmplParts.length === 2) {
                                                if (specifier.startsWith(tmplParts[0]) && specifier.endsWith(tmplParts[1])) {
                                                    return resolvePkgImports(specifier, searchURL, pkgData, imports[key], false, specifier.slice(tmplParts[0].length, specifier.length-tmplParts[1].length))
                                                }
                                            }
                                        }
                                    }
                                    return
                                }
                                if (typeof imports === 'string') {
                                    if (typeof expand === 'string') {
                                        imports = imports.replaceAll('*', expand)
                                    } 
                                    return new URL(imports, searchURL).href
                                }
                                for (const key of Object.keys(imports)) {
                                    if (key === 'default') {
                                        return resolvePkgImports(specifier, searchURL, pkgData, imports.default, false)
                                    }
                                    if (context.conditions.includes(key)) {
                                        return resolvePkgImports(specifier, searchURL, pkgData, imports.default, false)
                                    }
                                    return
                                }
                            }
                            if (specifier.startsWith('#')) {
                                const final = resolvePkgImports(specifier, searchURL, pkgData, pkgData.imports, true)
                                return {
                                    url: `sea:${final}`,
                                    shortCircuit: true
                                }
                            }
                            if (specifier.startsWith(pkgName + '/')) {
                                const final = resolvePkgImports('.' + specifier.slice(pkgName.length), searchURL, pkgData, pkgData.exports, true)
                                return {
                                    url: `sea:${final}`,
                                    shortCircuit: true
                                }
                            } else if (specifier === pkgName){
                                const final = resolvePkgImports('.', searchURL, pkgData, pkgData.exports, true)
                                return {
                                    url: `sea:${final}`,
                                    shortCircuit: true
                                }
                            } else {
                                let scope_and_name_and_specifier = /^((?:@[^\/]*\/)?[^\/]+)(\/[\s\S]*|)$/.exec(specifier)
                                if (scope_and_name_and_specifier) {
                                    const scope_and_name = scope_and_name_and_specifier[1]
                                    let prevURL = new URL(context.parentURL.replace('sea:', ''))
                                    let searchURL = new URL(`./node_modules/${scope_and_name}/package.json`, prevURL)
                                    while (prevURL.href !== searchURL.href) {
                                        // console.error('searching', searchURL.href)
                                        prevURL = searchURL
                                        const asset = getAsset(`${searchURL.href}`, 'utf-8')
                                        if (asset) {
                                            const pkgData = JSON.parse(asset);
                                            const final = resolvePkgImports('.' + scope_and_name_and_specifier[2], searchURL, pkgData, pkgData.exports, true)
                                            return {
                                                url: `sea:${final}`,
                                                shortCircuit: true
                                            }
                                        }
                                        searchURL = new URL(`../../../node_modules/${scope_and_name}/package.json`, prevURL)
                                    }
                                }
                            }
                            break
                        }
                        searchURL = new URL('../package.json', prevSearch)
                    }
                    return nextResolve(specifier, context)
                }
            }
            return nextResolve(specifier, context)
        }
    },
    load(url, context, nextLoad) {
        if (url.startsWith('sea:')) {
            return {
                format: JSON.parse(getAsset(url.replace('sea:','meta:'), 'utf-8')).format,
                source: getAsset(url.replace('sea:','')),
                shortCircuit: true
            }
        }
    },
})

const Module = require('module');

// Save the original loader so we can call it later.
const originalLoad = Module._load;
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function(request, parent) {
  if (parent.id.startsWith('sea:')) {
    return `\0${request}`
  }
  return originalResolveFilename.apply(this, arguments);
};
Module._load = function(request, parent, isMain) {
  // Your custom logic before loading the module.
//   console.log(`Intercepting require for module:`, {request, parent, isMain});

  // Optionally modify 'request', log details, or even return a custom module.
  // For example, you could conditionally return a stub or a different module.

  // Proceed with the actual loading of the module.
  const exported = originalLoad.apply(this, arguments);

  // Your custom logic after loading the module.
  // (e.g., post-process the exported object)

  return exported;
};


process.emitWarning = () => {}
process.on('warning', () => {
    return false
})
import(getAsset('#start', 'utf-8'))
