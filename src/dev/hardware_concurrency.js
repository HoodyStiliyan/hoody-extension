// settings.hardwareConcurrency

try {
    if(settings.hardwareConcurrency != undefined) {
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(window.navigator),
            'hardwareConcurrency',
            utils.makeHandler().getterValue(settings.hardwareConcurrency)
        )
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }