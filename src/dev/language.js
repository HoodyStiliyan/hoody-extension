// settings.languages

try {
    if(settings.languages) {
        const languages = settings.languages
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(navigator),
            'languages',
            utils.makeHandler().getterValue(Object.freeze([...languages]))
        )
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(navigator),
            'language',
            utils.makeHandler().getterValue(Object.freeze(languages[0]))
        )
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }