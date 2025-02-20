import child_process from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import url from 'url'
import { parseArgs } from 'util'
import module from 'module'

const args = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
        disableExperimentalSEAWarning: {
            type: 'boolean',
            default: true,
        },
        useSnapshot: {
            type: 'boolean',
            default: false,
        },
        useCodeCache: {
            type: 'boolean',
            default: true,
        },
        entry: {
            type: 'string',
        },
        name: {
            type: 'string',
            default: 'a.out',
        },
    }
})

const seapath = args.values.name
if (!seapath) {
    throw new Error('--name cannot be empty')
}
const entry = args.values.entry
if (!entry || !fs.existsSync(entry)) {
    throw new Error('--entry file must exist')
}
const main = path.resolve(entry)
const seaname = path.basename(seapath)
const seadir = path.dirname(seapath)
const config = path.join(seadir, seaname + '.config')
const blob = path.join(seadir, seaname + '.blob')
const bin = path.join(seadir, seaname) + (os.platform() === 'win32' ? '.exe' : '')
const assets = {}
const srcdir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'src')
const metadir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'meta')
fs.writeFileSync(path.join(metadir, '#start'), `sea:${url.pathToFileURL(main).href}`)
assets['#start'] = path.join(metadir, '#start')
module.registerHooks({
    resolve(specifier, context, nextResolve) {
        console.error(specifier, context)
        if (specifier.startsWith('meta:')) {
            const normalResolve = nextResolve(specifier.slice('meta:'.length), context)
            if (normalResolve.format === 'json') {
                normalResolve.importAttributes ??= Object.create(null)
                normalResolve.importAttributes.type = 'json'
            }
            return {
                ...normalResolve,
                url: `meta:${normalResolve.url}`
            }
        } else {
            return nextResolve(specifier, context)
        }
    },
    load(url, context, nextLoad) {
        if (url.startsWith('meta:')) {
            const normalLoad = nextLoad(url.slice('meta:'.length), context)
            // console.error({normalResolve: normalLoad})
            return {
                format: 'commonjs',
                source: `module.exports = ${JSON.stringify({format: normalLoad.format})}`
            }
        } else {
            return nextLoad(url, context)
        }
    },
})
fs.mkdirSync(metadir, {recursive: true})
let metaid = 1;

for (const filepath of fs.readdirSync(srcdir,{ recursive: true, encoding: 'utf-8' })) {
    const abspath = path.join(srcdir, filepath)
    if (fs.statSync(abspath).isFile()) {
        const key = url.pathToFileURL(abspath).href
        const metakey = `meta:${key}`
        assets[key] = abspath
        const metaid_for_path = `${metaid++}`
        const metapath = path.join(metadir, metaid_for_path)
        const meta = (await import(metakey)).default
        fs.writeFileSync(metapath, JSON.stringify(meta))
        assets[metakey] = metapath
    }
}
const seaconfig = {
    main: path.resolve('main.cjs'),
    output: blob,
    disableExperimentalSEAWarning: true,
    // useSnapshot: true, TODO
    useCodeCache: true,
    assets
}
console.dir(seaconfig)
console.error(process.execPath)
try {
    fs.mkdirSync(seadir, {recursive: true})
    fs.writeFileSync(config, JSON.stringify(seaconfig, null, 2))
    fs.copyFileSync(process.execPath, bin)
    child_process.execSync(`${process.execPath} --experimental-sea-config ${config}`, {encoding: 'utf-8'})
    if (os.platform() === 'darwin') {
        child_process.execSync(`codesign --remove-signature ${bin}`, {encoding: 'utf-8'})
        console.error('Removed signature')
        child_process.execSync(`npx postject ${bin} NODE_SEA_BLOB ${blob} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`, {encoding: 'utf-8'})
        console.error('Injected blob')
        child_process.execSync(`codesign --sign - ${bin}`, {encoding: 'utf-8'})
        console.error('Adding signature')
    } else if (os.platform() === 'win32') {
        child_process.execSync(`signtool remove /s ${bin}`, {encoding: 'utf-8'})
        child_process.execSync(`npx postject ${bin} NODE_SEA_BLOB ${blob} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`, {encoding: 'utf-8'})
        child_process.execSync(`signtool sign /fd SHA256 ${bin}`, {encoding: 'utf-8'}) // todo /f certfile ( https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe )
    } else {
        child_process.execSync(`npx postject ${bin} NODE_SEA_BLOB ${blob} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`, {encoding: 'utf-8'})
    } 
} catch (e) {
    console.error(e)
    process.exitCode = 1
} finally {
    try {
        await fs.unlinkSync(config)
        await fs.unlinkSync(blob)
    } catch {}
}
