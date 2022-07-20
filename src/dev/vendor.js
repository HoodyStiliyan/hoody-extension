// settings.vendor

// chrome: 'Google Inc.'
// safari: 'Apple Computer, Inc.'
// firefox: ''

try {
    if(settings.vendor != undefined) {
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(window.navigator),
            'vendor',
            utils.makeHandler().getterValue(Object.freeze(settings.vendor))
        )
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }