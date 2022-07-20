// settings.plugins

try {
    if(settings.plugins) {
        const data = settings.plugins

        const mimeTypes = utils.generateMimeTypeArray(data.mimeTypes)
        const plugins = utils.generatePluginArray(data.plugins)

        // Plugin and MimeType cross-reference each other, let's do that now
        // Note: We're looping through `data.plugins` here, not the generated `plugins`
        for (const pluginData of data.plugins) {
            pluginData.__mimeTypes.forEach((type, index) => {
                plugins[pluginData.name][index] = mimeTypes[type]

                Object.defineProperty(plugins[pluginData.name], type, {
                    value: mimeTypes[type],
                    writable: false,
                    enumerable: false, // Not enumerable
                    configurable: true
                })
                Object.defineProperty(mimeTypes[type], 'enabledPlugin', {
                    value: type === 'application/x-pnacl' ?
                        mimeTypes['application/x-nacl'].enabledPlugin // these reference the same plugin, so we need to re-use the Proxy in order to avoid leaks
                        :
                        new Proxy(plugins[pluginData.name], {}), // Prevent circular references
                    writable: false,
                    enumerable: false, // Important: `JSON.stringify(navigator.plugins)`
                    configurable: true
                })
            })
        }

        const patchNavigator = (name, value) => utils.replaceProperty(Object.getPrototypeOf(navigator), name, {
            get() {
                return value
            }
        })

        patchNavigator('mimeTypes', mimeTypes)
        patchNavigator('plugins', plugins)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }